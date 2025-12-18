/**
 * @since 0.0.1
 * Mimic server layer composition.
 */
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Context from "effect/Context";
import type * as Socket from "@effect/platform/Socket";
import { SocketServer } from "@effect/platform/SocketServer";

import * as DocumentManager from "./DocumentManager.js";
import * as WebSocketHandler from "./WebSocketHandler.js";
import {
  MimicServerConfigTag,
  type MimicServerConfig,
  type MimicServerConfigOptions,
  layer as configLayer,
} from "./MimicConfig.js";

// =============================================================================
// Handler Tag
// =============================================================================

/**
 * Tag for the WebSocket handler function.
 */
export class MimicWebSocketHandler extends Context.Tag(
  "@voidhash/mimic-server-effect/MimicWebSocketHandler"
)<
  MimicWebSocketHandler,
  (socket: Socket.Socket, path: string) => Effect.Effect<void, unknown>
>() {}

// =============================================================================
// Layer Composition
// =============================================================================

/**
 * Create the Mimic server handler layer.
 * This layer provides the WebSocket handler that can be used with any WebSocket server.
 *
 * @example
 * ```typescript
 * import { MimicServer, MimicConfig } from "@voidhash/mimic-server-effect";
 * import { SocketServer } from "@effect/platform/SocketServer";
 * import { Primitive } from "@voidhash/mimic";
 *
 * // Define your document schema
 * const TodoSchema = Primitive.Struct({
 *   title: Primitive.String(),
 *   completed: Primitive.Boolean(),
 * });
 *
 * // Create the server layer
 * const serverLayer = MimicServer.layer({
 *   schemas: { "todo": TodoSchema },
 * });
 *
 * // Run with your socket server
 * Effect.gen(function* () {
 *   const handler = yield* MimicServer.MimicWebSocketHandler;
 *   const server = yield* SocketServer;
 *
 *   yield* server.run((socket) =>
 *     // Extract path from request somehow and call handler
 *     handler(socket, "/doc/my-document-id")
 *   );
 * }).pipe(
 *   Effect.provide(serverLayer),
 *   Effect.provide(YourSocketServerLayer),
 * );
 * ```
 */
export const handlerLayer = (
  options: MimicServerConfigOptions
): Layer.Layer<MimicWebSocketHandler> =>
  Layer.effect(MimicWebSocketHandler, WebSocketHandler.makeHandler).pipe(
    Layer.provide(DocumentManager.layer),
    Layer.provide(configLayer(options))
  );

/**
 * Create the document manager layer.
 */
export const documentManagerLayer = (
  options: MimicServerConfigOptions
): Layer.Layer<DocumentManager.DocumentManagerTag> =>
  DocumentManager.layer.pipe(Layer.provide(configLayer(options)));

/**
 * Create a complete Mimic server layer that includes:
 * - Document manager for state management
 * - WebSocket handler for incoming connections
 *
 * You still need to provide:
 * - A SocketServer implementation
 *
 * @example
 * ```typescript
 * import { MimicServer } from "@voidhash/mimic-server-effect";
 * import { NodeSocketServer } from "@effect/platform-node/NodeSocketServer";
 *
 * const serverLayer = MimicServer.layer({
 *   schemas: { "todo": TodoSchema },
 * });
 *
 * // Run the server
 * Effect.gen(function* () {
 *   const handler = yield* MimicServer.MimicWebSocketHandler;
 *   const server = yield* SocketServer;
 *
 *   yield* server.run((socket) => handler(socket, extractPath(socket)));
 * }).pipe(
 *   Effect.provide(serverLayer),
 *   Effect.provide(NodeSocketServer.layer({ port: 3000 })),
 * );
 * ```
 */
export const layer = (
  options: MimicServerConfigOptions
): Layer.Layer<MimicWebSocketHandler | DocumentManager.DocumentManagerTag> =>
  Layer.merge(handlerLayer(options), documentManagerLayer(options));

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Run a Mimic WebSocket server with the provided handler.
 *
 * This is a helper that:
 * 1. Gets the WebSocket handler from context
 * 2. Runs the socket server with the handler
 *
 * Note: The path extraction from socket is implementation-specific.
 * You may need to customize this based on your socket server.
 */
export const run = (
  extractPath: (socket: Socket.Socket) => Effect.Effect<string>
) =>
  Effect.gen(function* () {
    const handler = yield* MimicWebSocketHandler;
    const server = yield* SocketServer;

    yield* server.run((socket) =>
      Effect.gen(function* () {
        const path = yield* extractPath(socket);
        yield* handler(socket, path);
      }).pipe(
        Effect.catchAll((error) =>
          Effect.logError("Connection error", error)
        )
      )
    );
  });

// =============================================================================
// Re-exports
// =============================================================================

export {
  MimicServerConfigTag,
  type MimicServerConfig,
  type MimicServerConfigOptions,
} from "./MimicConfig.js";
export {
  DocumentManagerTag,
  type DocumentManager,
} from "./DocumentManager.js";
export * as Protocol from "./DocumentProtocol.js";
export * as WebSocketHandler from "./WebSocketHandler.js";
