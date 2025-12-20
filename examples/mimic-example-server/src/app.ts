import { Effect, Layer } from "effect";
import { MimicServer, MimicAuthService } from "@voidhash/mimic-effect";
import { MimicExampleSchema } from "@voidhash/mimic-example-shared";
import { HttpLayerRouter } from "@effect/platform";

// Custom auth layer - allows all tokens
const CustomAuthLayer = MimicAuthService.layer({
  authHandler: (token) => ({
    success: true,
    userId: token || "anonymous",
  }),
});

// Create the Mimic route for HttpLayerRouter with custom auth
const MimicRoute = MimicServer.layerHttpLayerRouter({
  basePath: "/mimic/todo",
  schema: MimicExampleSchema,
  authLayer: CustomAuthLayer,
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
