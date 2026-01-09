/**
 * Mimic Server Cluster Example
 *
 * This example demonstrates how to use MimicClusterServerEngine for horizontally
 * scaled deployments using Effect Cluster.
 *
 * NOTE: For a production cluster deployment, you need to:
 * 1. Configure NodeClusterSocket.layer or NodeClusterHttp.layer
 * 2. Provide SQL storage for message/runner persistence
 * 3. Set up multiple server instances
 *
 * This example uses SingleRunner for local development, which provides
 * in-memory cluster behavior suitable for testing.
 */

import { Effect, Layer } from "effect";
import {
  MimicClusterServerEngine,
  MimicServer,
  MimicAuthService,
  ColdStorage,
  HotStorage,
  type InitialContext,
} from "@voidhash/mimic-effect";
import {
  MimicExampleSchema,
  PresenceSchema,
} from "@voidhash/mimic-example-shared";
import { HttpLayerRouter } from "@effect/platform";
import { TestRunner } from "@effect/cluster";

// Custom auth layer - v2 API
// Allows all tokens with write permission
const CustomAuthLayer = MimicAuthService.make(
  Effect.gen(function* () {
    return {
      authenticate: (token: string, _documentId: string) =>
        Effect.succeed({
          userId: token || "anonymous",
          permission: "write" as const,
        }),
    };
  })
);

// Mimic Storage layers (for document persistence)
const MimicStorageLayers = Layer.mergeAll(
  ColdStorage.InMemory.make(),
  HotStorage.InMemory.make()
);

// Cluster infrastructure using TestRunner for development
// This provides in-memory cluster behavior suitable for testing.
// In production, use NodeClusterSocket.layer or NodeClusterHttp.layer
const ClusterLive = TestRunner.layer;

// Create Cluster Engine layer
const EngineLive = MimicClusterServerEngine.make({
  schema: MimicExampleSchema,
  presence: PresenceSchema,
  shardGroup: "mimic-documents",
  initial: (ctx: InitialContext) =>
    Effect.succeed({
      type: "board" as const,
      name: ctx.documentId,
      children: [
        { type: "column" as const, name: "Todo", children: [] },
        { type: "column" as const, name: "In Progress", children: [] },
        { type: "column" as const, name: "Done", children: [] },
      ],
    }),
}).pipe(
  Layer.provide(MimicStorageLayers),
  Layer.provide(CustomAuthLayer)
);

// Create the WebSocket route
const MimicRoute = MimicServer.layerHttpLayerRouter({
  path: "/mimic/todo",
});

// Wire everything together
const MimicLive = MimicRoute.pipe(
  Layer.provide(EngineLive),
  Layer.provide(CustomAuthLayer),
  Layer.provide(ClusterLive)
);

// Compose routes with CORS
const AllRoutes = Layer.mergeAll(MimicLive).pipe(
  Layer.provide(
    HttpLayerRouter.cors({
      allowedOrigins: ["http://localhost:3000"],
      credentials: true,
    })
  )
);

export const AppLive = HttpLayerRouter.serve(AllRoutes);
