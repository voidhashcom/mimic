import { Effect, Layer, Schema } from "effect";
import { MimicServer, MimicAuthService } from "@voidhash/mimic-effect";
import { MimicExampleSchema, PresenceSchema } from "@voidhash/mimic-example-shared";
import { HttpLayerRouter } from "@effect/platform";
import { Presence } from "@voidhash/mimic";

// Custom auth layer - allows all tokens
const CustomAuthLayer = MimicAuthService.layer({
  authHandler: (token) => ({
    success: true,
    userId: token || "anonymous",
  }),
});


// Create the Mimic route for HttpLayerRouter with custom auth and presence
const MimicRoute = MimicServer.layerHttpLayerRouter({
  basePath: "/mimic/todo",
  schema: MimicExampleSchema,
  authLayer: CustomAuthLayer,
  presence: PresenceSchema,
  initial: {
    type: "board",
    name: "My Board",
    children: [
      {
        type: "column",
        name: "Todo",
        children: [],
      },
      {
        type: "column",
        name: "In Progress",
        children: [],
      },
      {
        type: "column",
        name: "Done",
        children: [],
      }
    ],
  }
});

const AllRoutes = Layer.mergeAll(
  MimicRoute
).pipe(
  Layer.provide(
    HttpLayerRouter.cors({
      allowedOrigins: ['http://localhost:3000'],
      credentials: true
    })
  )
);

export const AppLive = HttpLayerRouter.serve(AllRoutes);
