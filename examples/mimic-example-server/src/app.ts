import { Console, Effect, Layer } from "effect";
import { MimicServer, MimicAuthService, MimicConfig } from "@voidhash/mimic-effect";
import { MimicExampleSchema, PresenceSchema } from "@voidhash/mimic-example-shared";
import { HttpLayerRouter } from "@effect/platform";

// Custom auth layer - allows all tokens
const CustomAuthLayer = MimicAuthService.layer({
  authHandler: (token) => ({
    success: true,
    userId: token || "anonymous",
  }),
});

class SomeTestService extends Effect.Service<SomeTestService>()("app/SomeTestService", {
  // Define how to create the service
  effect: Effect.gen(function* () {
    const hello = (name: string) => Effect.gen(function* () {
      yield* Console.log(`Hello ${name}!`);
      return name;
    });
    return { hello } as const;
  }),
  // Specify dependencies
  dependencies: []
}) {}


// Create the Mimic route for HttpLayerRouter with custom auth and presence
const MimicRoute = MimicServer.layerHttpLayerRouter(Effect.gen(function* () {
  const someRandomService = yield* SomeTestService;
  return {
  basePath: "/mimic/todo",
  schema: MimicExampleSchema,
  presence: PresenceSchema,
  authLayer: CustomAuthLayer,
  // Initial function that uses SomeTestService
  initial: (ctx: MimicConfig.InitialContext) => Effect.gen(function* () {
    console.log("Initial function called with documentId:", ctx.documentId);
    console.log("SomeTestService:");
    const name = yield* someRandomService.hello(ctx.documentId);
    return {
      type: "board" as const,
      name: name,
      children: [
        {
          type: "column" as const,
          name: "Todo",
          children: [],
        },
        {
          type: "column" as const,
          name: "In Progress",
          children: [],
        },
        {
          type: "column" as const,
          name: "Done",
          children: [],
        }
      ],
    }
  }),
}}))

 

const AllRoutes = Layer.mergeAll(
  MimicRoute
).pipe(
  Layer.provide(
    HttpLayerRouter.cors({
      allowedOrigins: ['http://localhost:3000'],
      credentials: true
    })
  ),
  // Provide the service used by the initial function
  Layer.provide(SomeTestService.Default)
);

export const AppLive = HttpLayerRouter.serve(AllRoutes);
