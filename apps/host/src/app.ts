import { Effect, Layer } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";
import { RpcServer, RpcSerialization } from "effect/unstable/rpc";
import { MimicRpcs } from "@voidhash/mimic-protocol";
import * as TestRunner from "effect/unstable/cluster/TestRunner";

import { MysqlLive } from "./mysql/MysqlLayer";
import { DatabaseRepositoryLive } from "./mysql/DatabaseRepository";
import { CollectionRepositoryLive } from "./mysql/CollectionRepository";
import { DocumentRepositoryLive } from "./mysql/DocumentRepository";
import { UserRepositoryLive } from "./mysql/UserRepository";
import { DocumentTokenRepositoryLive } from "./mysql/DocumentTokenRepository";
import { DatabaseServiceLive } from "./services/DatabaseService";
import { CollectionServiceLive } from "./services/CollectionService";
import { UserServiceLive } from "./services/UserService";
import { DocumentTokenServiceLive } from "./services/DocumentTokenService";
import { AuthServiceLive } from "./auth/AuthService";
import { BootstrapLive } from "./services/BootstrapService";
import { MimicDocumentEntityLive } from "./engine/DocumentEntity";
import { DocumentGatewayLive } from "./engine/DocumentGateway";
import { RpcHandlersLive } from "./rpc/RpcHandlers";
import { AuthMiddlewareLive } from "./rpc/AuthMiddlewareLive";
import { WsRoute } from "./ws/WsRouter";

/**
 * Returns the CORS allowed origins configuration.
 *
 * Set `CORS_ORIGINS` to a comma-separated list of allowed origins,
 * or `*` to allow all origins (disables credentials).
 *
 * Defaults to `http://localhost:5173` for local development.
 */
const corsAllowedOrigins = (): ReadonlyArray<string> | ((origin: string) => boolean) => {
  const env = process.env.CORS_ORIGINS?.trim();
  if (!env) return ["http://localhost:5173", "http://localhost:3003"];
  if (env === "*") return () => true;
  return env.split(",").map((o) => o.trim());
};

// Health check route
const HealthCheckRoute = Layer.effectDiscard(
  Effect.gen(function* () {
    const router = yield* HttpRouter.HttpRouter;
    yield* router.add("GET", "/health", HttpServerResponse.text("OK"));
  }),
);

// Repository layers (depend on SqlClient from MysqlLive)
const RepositoryLayers = Layer.mergeAll(
  DatabaseRepositoryLive,
  CollectionRepositoryLive,
  DocumentRepositoryLive,
  UserRepositoryLive,
  DocumentTokenRepositoryLive,
);

// Core service layers (depend on repositories)
const CoreServiceLayers = Layer.mergeAll(
  DatabaseServiceLive,
  CollectionServiceLive,
  UserServiceLive,
  DocumentTokenServiceLive,
);

// Auth depends on UserService + DocumentTokenService, so provide core services to it
const ServiceLayers = AuthServiceLive.pipe(
  Layer.provideMerge(CoreServiceLayers),
);

// Sharding layer (TestRunner for development)
const ShardingLive = TestRunner.layer;

// Entity layer (depends on repositories + sharding)
const EntityLayer = MimicDocumentEntityLive;

// Gateway layer (depends on entity client + sharding)
const GatewayLayer = DocumentGatewayLive;

// RPC server layer
const RpcLive = RpcServer.layerHttp({
  group: MimicRpcs,
  path: "/rpc",
  protocol: "http",
});

// All routes (health check + WS + RPC via RpcServer)
const AllRoutes = Layer.mergeAll(HealthCheckRoute, WsRoute, RpcLive).pipe(
  Layer.provide(RpcHandlersLive),
  Layer.provide(AuthMiddlewareLive),
  Layer.provide(RpcSerialization.layerNdjson),
  Layer.provide(
    HttpRouter.cors({
      allowedOrigins: corsAllowedOrigins(),
      credentials: true,
    }),
  ),
);

// Full application layer
export const AppLive = HttpRouter.serve(AllRoutes).pipe(
  // Provide gateway for WS route
  Layer.provide(GatewayLayer),
  // Provide entity registration (needs sharding)
  Layer.provide(EntityLayer),
  // Provide sharding
  Layer.provide(ShardingLive),
  // Bootstrap root user
  Layer.provide(BootstrapLive),
  // Provide services
  Layer.provide(ServiceLayers),
  // Provide repositories
  Layer.provide(RepositoryLayers),
  // Provide MySQL (client + migrator)
  Layer.provide(MysqlLive),
);
