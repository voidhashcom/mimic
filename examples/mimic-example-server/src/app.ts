import { Console, Effect, Layer } from "effect";
import {
  MimicServerEngine,
  MimicServerEngineTag,
  MimicServer,
  MimicAuthService,
  ColdStorage,
  HotStorage,
} from "@voidhash/mimic-effect";
import {
  MimicExampleSchema,
  PresenceSchema,
} from "@voidhash/mimic-example-shared";
import { HttpLayerRouter } from "@effect/platform";

// Service used by initial function
class SomeTestService extends Effect.Service<SomeTestService>()(
  "app/SomeTestService",
  {
    effect: Effect.gen(function* () {
      const hello = (name: string) =>
        Effect.gen(function* () {
          yield* Console.log(`Hello ${name}!`);
          return name;
        });
      return { hello } as const;
    }),
    dependencies: [],
  }
) {}

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

// Storage layers
const StorageLayers = Layer.mergeAll(
  ColdStorage.InMemory.make(),
  HotStorage.InMemory.make()
);

// Create Engine layer with service access
// We use Layer.unwrapEffect to create a layer that accesses services at creation time
const EngineLive: Layer.Layer<MimicServerEngineTag> = Layer.unwrapEffect(
  Effect.gen(function* () {
    // Access SomeTestService at engine creation time
    const someRandomService = yield* SomeTestService;

    // Return the engine layer with the service captured in closure
    return MimicServerEngine.make({
      schema: MimicExampleSchema,
      presence: PresenceSchema,
      initial: (ctx) =>
        Effect.gen(function* () {
          console.log(
            "Initial function called with documentId:",
            ctx.documentId
          );
          // Use the captured service reference
          const name = yield* someRandomService.hello(ctx.documentId);
          return {
            type: "board" as const,
            name: name,
            children: [
              { type: "column" as const, name: "Todo", children: [] },
              { type: "column" as const, name: "In Progress", children: [] },
              { type: "column" as const, name: "Done", children: [] },
            ],
          };
        }),
    });
  })
).pipe(
  Layer.provide(SomeTestService.Default),
  Layer.provide(StorageLayers),
  Layer.provide(CustomAuthLayer)
);

// Create the WebSocket route
const MimicRoute = MimicServer.layerHttpLayerRouter({
  path: "/mimic/todo",
});

// Wire everything together
// The route layer now captures engine and auth at layer creation time
const MimicLive = MimicRoute.pipe(
  Layer.provide(EngineLive),
  Layer.provide(CustomAuthLayer)
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
