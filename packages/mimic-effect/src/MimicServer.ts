/**
 * @since 0.0.1
 * Mimic server layer composition.
 */
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Context from "effect/Context";
import type * as Socket from "@effect/platform/Socket";
import { SocketServer } from "@effect/platform/SocketServer";
import type { Primitive, Presence } from "@voidhash/mimic";

import * as DocumentManager from "./DocumentManager.js";
import * as WebSocketHandler from "./WebSocketHandler.js";
import * as MimicConfig from "./MimicConfig.js";
import { MimicDataStorageTag } from "./MimicDataStorage.js";
import { MimicAuthServiceTag } from "./MimicAuthService.js";
import * as PresenceManager from "./PresenceManager.js";
import * as InMemoryDataStorage from "./storage/InMemoryDataStorage.js";
import * as NoAuth from "./auth/NoAuth.js";
import { HttpLayerRouter, HttpServerRequest, HttpServerResponse } from "@effect/platform";
import { PathInput } from "@effect/platform/HttpRouter";

// =============================================================================
// Layer Composition Options
// =============================================================================

/**
 * Options for creating a Mimic server layer.
 */
export interface MimicLayerOptions<
  TSchema extends Primitive.AnyPrimitive,
> {
  /**
   * Base path for document routes (used for path matching).
   * @example "/mimic/todo" - documents accessed at "/mimic/todo/:documentId"
   */
  readonly basePath?: PathInput;
  /**
   * The schema defining the document structure.
   */
  readonly schema: TSchema;
  /**
   * Maximum number of processed transaction IDs to track for deduplication.
   * @default 1000
   */
  readonly maxTransactionHistory?: number;
  /**
   * Optional presence schema for ephemeral per-user data.
   * When provided, enables presence features on WebSocket connections.
   */
  readonly presence?: Presence.AnyPresence;
  /**
   * Initial state for new documents.
   * Can be either:
   * - A plain object with the initial state values
   * - A function that receives context (with documentId) and returns an Effect producing the initial state
   *
   * When using a function that requires Effect services (has R requirements),
   * you must also provide `initialLayer` to supply those dependencies.
   *
   * Type-safe: required fields (without defaults) must be provided,
   * while optional fields and fields with defaults can be omitted.
   *
   * @default undefined (documents start empty or use schema defaults)
   */
  readonly initial?: Primitive.InferSetInput<TSchema> | MimicConfig.InitialFn<TSchema>;
}


/**
 * Create the document manager layer.
 */
export const documentManagerLayer = <TSchema extends Primitive.AnyPrimitive>(
  options: MimicConfig.MimicServerConfigOptions<TSchema>
): Layer.Layer<DocumentManager.DocumentManagerTag> =>
  DocumentManager.layer.pipe(
    Layer.provide(MimicConfig.layer(options)),
    // Provide defaults
    Layer.provide(InMemoryDataStorage.layerDefault),
    Layer.provide(NoAuth.layerDefault)
  );

/**
 * Create the HTTP handler effect for WebSocket upgrade.
 * This handler:
 * 1. Extracts the document ID from the URL path
 * 2. Upgrades the HTTP connection to WebSocket
 * 3. Delegates to the WebSocketHandler for document sync
 */
const makeMimicHandler = Effect.gen(function* () {
  const config = yield* MimicConfig.MimicServerConfigTag;
  const authService = yield* MimicAuthServiceTag;
  const documentManager = yield* DocumentManager.DocumentManagerTag;
  const presenceManager = yield* PresenceManager.PresenceManagerTag;

  return Effect.gen(function* () {
    const request = yield* HttpServerRequest.HttpServerRequest;

    // Extract document ID from the URL path
    // Expected format: /basePath/doc/{documentId}
    const documentId = yield* WebSocketHandler.extractDocumentId(request.url);

    // Upgrade to WebSocket
    const socket = yield* request.upgrade;

    // Handle the WebSocket connection
    yield* WebSocketHandler.handleConnection(socket, request.url).pipe(
      Effect.provideService(MimicConfig.MimicServerConfigTag, config),
      Effect.provideService(MimicAuthServiceTag, authService),
      Effect.provideService(DocumentManager.DocumentManagerTag, documentManager),
      Effect.provideService(PresenceManager.PresenceManagerTag, presenceManager),
      Effect.scoped,
      Effect.catchAll((error) =>
        Effect.logError("WebSocket connection error", error)
      )
    );

    // Return empty response - the WebSocket upgrade handles the connection
    return HttpServerResponse.empty();
  }).pipe(
    Effect.catchAll((error) =>
      Effect.gen(function* () {
        yield* Effect.logWarning("WebSocket upgrade failed", error);
        return HttpServerResponse.text("WebSocket upgrade failed", {
          status: 400,
        });
      })
    )
  );
});



/**
 * Options for layerHttpLayerRouter including optional custom layers.
 */
export interface MimicLayerRouterOptions<TSchema extends Primitive.AnyPrimitive>
  extends MimicLayerOptions<TSchema> {
  /** Custom auth layer. Defaults to NoAuth (all connections allowed). */
  readonly authLayer?: Layer.Layer<MimicAuthServiceTag>;
  /** Custom storage layer. Defaults to InMemoryDataStorage. */
  readonly storageLayer?: Layer.Layer<MimicDataStorageTag>;
}

/**
 * Create a Mimic server layer that integrates with HttpLayerRouter.
 *
 * This function creates a layer that:
 * 1. Registers a WebSocket route at the specified base path
 * 2. Handles WebSocket upgrades for document sync
 * 3. Provides all required dependencies (config, auth, storage, document manager)
 *
 * By default, uses in-memory storage and no authentication.
 * To override these defaults, provide custom layers before the defaults:
 *
 * @example
 * ```typescript
 * import { MimicServer, MimicAuthService } from "@voidhash/mimic-effect";
 * import { HttpLayerRouter } from "@effect/platform";
 * import { Primitive } from "@voidhash/mimic";
 *
 * const TodoSchema = Primitive.Struct({
 *   title: Primitive.String(),
 *   completed: Primitive.Boolean(),
 * });
 *
 * // Create the Mimic route layer with defaults
 * const MimicRoute = MimicServer.layerHttpLayerRouter({
 *   basePath: "/mimic/todo",
 *   schema: TodoSchema
 * });
 *
 * // Or with custom auth - use Layer.provide to inject before defaults
 * const MimicRouteWithAuth = MimicServer.layerHttpLayerRouter({
 *   basePath: "/mimic/todo",
 *   schema: TodoSchema,
 *   authLayer: MimicAuthService.layer({
 *     authHandler: (token) => ({ success: true, userId: token })
 *   })
 * });
 *
 * // Merge with other routes and serve
 * const AllRoutes = Layer.mergeAll(MimicRoute, OtherRoutes);
 * HttpLayerRouter.serve(AllRoutes).pipe(
 *   Layer.provide(BunHttpServer.layer({ port: 3000 })),
 *   Layer.launch,
 *   BunRuntime.runMain
 * );
 * ```
 */
export const layerHttpLayerRouter = <
  TSchema extends Primitive.AnyPrimitive,
  TError,
  TRequirements
>(
  optionsEf: Effect.Effect<MimicLayerRouterOptions<TSchema>, TError, TRequirements>
): Layer.Layer<never, TError, TRequirements | HttpLayerRouter.HttpRouter> => {
  return Layer.unwrapScoped(
    Effect.gen(function* () {
      const options = yield* optionsEf;

      // Build the base path pattern for WebSocket routes
      // Append /doc/* to match /basePath/doc/{documentId}
      const basePath = options.basePath ?? "/mimic";
      const wsPath: PathInput = `${basePath}/doc/*` as PathInput;

      // Create the config layer with properly typed initial function
      const configLayer = MimicConfig.layer<TSchema>({
        schema: options.schema,
        maxTransactionHistory: options.maxTransactionHistory,
        presence: options.presence,
        initial: options.initial,
      });

      // Use provided layers or defaults
      const authLayer = options.authLayer ?? NoAuth.layerDefault;
      const storageLayer = options.storageLayer ?? InMemoryDataStorage.layerDefault;

      // Combine all dependency layers
      const depsLayer = Layer.mergeAll(configLayer, authLayer, storageLayer);

      // Create the route registration layer
      const routeLayer = Layer.scopedDiscard(
        Effect.gen(function* () {
          const router = yield* HttpLayerRouter.HttpRouter;
          const handler = yield* makeMimicHandler;
          yield* router.add("GET", wsPath, handler);
        })
      );

      // Build the complete layer with all dependencies provided
      return routeLayer.pipe(
        Layer.provide(DocumentManager.layer),
        Layer.provide(PresenceManager.layer),
        Layer.provide(depsLayer),
      );
    })
  );
};