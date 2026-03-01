import { Effect, Layer } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";
import * as TestRunner from "effect/unstable/cluster/TestRunner";

import { MysqlLive } from "./mysql/MysqlLayer";
import { DatabaseRepositoryLive } from "./mysql/DatabaseRepository";
import { CollectionRepositoryLive } from "./mysql/CollectionRepository";
import { DocumentRepositoryLive } from "./mysql/DocumentRepository";
import { DatabaseServiceLive } from "./services/DatabaseService";
import { CollectionServiceLive } from "./services/CollectionService";
import { AuthServiceLive } from "./auth/AuthService";
import { MimicDocumentEntityLive } from "./engine/DocumentEntity";
import { DocumentGatewayLive } from "./engine/DocumentGateway";
import { RpcRoute } from "./rpc/RpcRoute";
import { WsRoute } from "./ws/WsRouter";

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
);

// Service layers (depend on repositories)
const ServiceLayers = Layer.mergeAll(
  DatabaseServiceLive,
  CollectionServiceLive,
  AuthServiceLive,
);

// Sharding layer (TestRunner for development)
const ShardingLive = TestRunner.layer;

// Entity layer (depends on repositories + sharding)
const EntityLayer = MimicDocumentEntityLive;

// Gateway layer (depends on entity client + sharding)
const GatewayLayer = DocumentGatewayLive;

// All routes
const AllRoutes = Layer.mergeAll(HealthCheckRoute, RpcRoute, WsRoute).pipe(
  Layer.provide(
    HttpRouter.cors({
      allowedOrigins: ["*"],
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
  // Provide services
  Layer.provide(ServiceLayers),
  // Provide repositories
  Layer.provide(RepositoryLayers),
  // Provide MySQL (client + migrator)
  Layer.provide(MysqlLive),
);
