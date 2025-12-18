/**
 * @since 0.0.1
 * WebSocket connection handler using Effect Platform Socket API.
 */
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import * as Fiber from "effect/Fiber";
import * as Scope from "effect/Scope";
import * as Duration from "effect/Duration";
import type * as Socket from "@effect/platform/Socket";

import * as Protocol from "./DocumentProtocol.js";
import { MimicServerConfigTag } from "./MimicConfig.js";
import { DocumentManagerTag } from "./DocumentManager.js";
import {
  MessageParseError,
  MissingDocumentIdError,
} from "./errors.js";

// =============================================================================
// Client Message Types (matching mimic-client Transport.ts)
// =============================================================================

interface SubmitMessage {
  readonly type: "submit";
  readonly transaction: Protocol.Transaction;
}

interface RequestSnapshotMessage {
  readonly type: "request_snapshot";
}

interface PingMessage {
  readonly type: "ping";
}

interface AuthMessage {
  readonly type: "auth";
  readonly token: string;
}

type ClientMessage =
  | SubmitMessage
  | RequestSnapshotMessage
  | PingMessage
  | AuthMessage;

// =============================================================================
// Server Message Types (matching mimic-client Transport.ts)
// =============================================================================

interface PongMessage {
  readonly type: "pong";
}

interface AuthResultMessage {
  readonly type: "auth_result";
  readonly success: boolean;
  readonly error?: string;
}

type ServerMessage =
  | Protocol.TransactionMessage
  | Protocol.SnapshotMessage
  | Protocol.ErrorMessage
  | PongMessage
  | AuthResultMessage;

// =============================================================================
// WebSocket Connection State
// =============================================================================

interface ConnectionState {
  readonly documentId: string;
  readonly connectionId: string;
  readonly authenticated: boolean;
  readonly userId?: string;
}

// =============================================================================
// URL Path Parsing
// =============================================================================

/**
 * Extract document ID from URL path.
 * Expected format: /doc/{documentId} or /{documentId}
 */
export const extractDocumentId = (
  path: string
): Effect.Effect<string, MissingDocumentIdError> => {
  // Remove leading slash and split
  const parts = path.replace(/^\/+/, "").split("/");

  // Check for /doc/{documentId} format
  if (parts[0] === "doc" && parts[1]) {
    return Effect.succeed(decodeURIComponent(parts[1]));
  }

  // Check for /{documentId} format
  if (parts[0] && parts[0] !== "doc") {
    return Effect.succeed(decodeURIComponent(parts[0]));
  }

  return Effect.fail(new MissingDocumentIdError({}));
};

// =============================================================================
// Message Parsing
// =============================================================================

const parseClientMessage = (
  data: string | Uint8Array
): Effect.Effect<ClientMessage, MessageParseError> =>
  Effect.try({
    try: () => {
      const text =
        typeof data === "string" ? data : new TextDecoder().decode(data);
      return JSON.parse(text) as ClientMessage;
    },
    catch: (cause) => new MessageParseError({ cause }),
  });

const encodeServerMessage = (message: ServerMessage): string =>
  JSON.stringify(message);

// =============================================================================
// WebSocket Handler
// =============================================================================

/**
 * Handle a WebSocket connection for a document.
 *
 * @param socket - The Effect Platform Socket
 * @param path - The URL path (e.g., "/doc/my-document-id")
 * @returns An Effect that handles the connection lifecycle
 */
export const handleConnection = (
  socket: Socket.Socket,
  path: string
): Effect.Effect<
  void,
  Socket.SocketError | MissingDocumentIdError | MessageParseError,
  MimicServerConfigTag | DocumentManagerTag | Scope.Scope
> =>
  Effect.gen(function* () {
    const config = yield* MimicServerConfigTag;
    const documentManager = yield* DocumentManagerTag;

    // Extract document ID from path
    const documentId = yield* extractDocumentId(path);
    const connectionId = crypto.randomUUID();

    // Track connection state
    let state: ConnectionState = {
      documentId,
      connectionId,
      authenticated: !config.authHandler, // If no auth handler, consider authenticated
    };

    // Get the socket writer
    const write = yield* socket.writer;

    // Helper to send a message to the client
    const sendMessage = (message: ServerMessage) =>
      write(encodeServerMessage(message));

    // Handle authentication
    const handleAuth = (token: string) =>
      Effect.gen(function* () {
        if (!config.authHandler) {
          // No auth configured, auto-succeed
          yield* sendMessage({ type: "auth_result", success: true });
          state = { ...state, authenticated: true };
          return;
        }

        const result = yield* Effect.promise(() =>
          Promise.resolve(config.authHandler!(token))
        );

        if (result.success) {
          state = {
            ...state,
            authenticated: true,
            userId: result.userId,
          };
          yield* sendMessage({ type: "auth_result", success: true });
        } else {
          yield* sendMessage({
            type: "auth_result",
            success: false,
            error: result.error,
          });
        }
      });

    // Handle a client message
    const handleMessage = (message: ClientMessage) =>
      Effect.gen(function* () {
        switch (message.type) {
          case "auth":
            yield* handleAuth(message.token);
            break;

          case "ping":
            yield* sendMessage({ type: "pong" });
            break;

          case "submit":
            if (!state.authenticated) {
              yield* sendMessage({
                type: "error",
                transactionId: message.transaction.id,
                reason: "Not authenticated",
              });
              return;
            }
            // Submit to the document manager
            const submitResult = yield* Effect.catchAll(
              documentManager.submit(
                documentId,
                message.transaction as any
              ),
              (error) =>
                Effect.succeed({
                  success: false as const,
                  reason: error.message,
                })
            );
            // If rejected, send error (success is broadcast to all)
            if (!submitResult.success) {
              yield* sendMessage({
                type: "error",
                transactionId: message.transaction.id,
                reason: submitResult.reason,
              });
            }
            break;

          case "request_snapshot":
            if (!state.authenticated) {
              return;
            }
            const snapshot = yield* Effect.catchAll(
              documentManager.getSnapshot(documentId),
              () =>
                Effect.succeed({
                  type: "snapshot" as const,
                  state: null,
                  version: 0,
                })
            );
            yield* sendMessage(snapshot);
            break;
        }
      });

    // Subscribe to document broadcasts
    const subscribeFiber = yield* Effect.fork(
      Effect.gen(function* () {
        // Wait until authenticated before subscribing
        while (!state.authenticated) {
          yield* Effect.sleep(Duration.millis(100));
        }

        // Subscribe to the document
        const broadcastStream = yield* Effect.catchAll(
          documentManager.subscribe(documentId),
          () => Effect.succeed(Stream.empty)
        );

        // Forward broadcasts to the WebSocket
        yield* Stream.runForEach(broadcastStream, (broadcast) =>
          sendMessage(broadcast as ServerMessage)
        );
      }).pipe(Effect.scoped)
    );

    // Ensure cleanup on disconnect
    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        // Interrupt the subscribe fiber
        yield* Fiber.interrupt(subscribeFiber);
      })
    );

    // Process incoming messages
    yield* socket.runRaw((data) =>
      Effect.gen(function* () {
        const message = yield* parseClientMessage(data);
        yield* handleMessage(message);
      }).pipe(
        Effect.catchAll((error) =>
          Effect.logError("Message handling error", error)
        )
      )
    );
  });

// =============================================================================
// WebSocket Server Handler Factory
// =============================================================================

/**
 * Create a handler function for the WebSocket server.
 * This extracts the path from the socket and calls handleConnection.
 */
export const makeHandler = Effect.gen(function* () {
  const config = yield* MimicServerConfigTag;
  const documentManager = yield* DocumentManagerTag;

  return (socket: Socket.Socket, path: string) =>
    handleConnection(socket, path).pipe(
      Effect.provideService(MimicServerConfigTag, config),
      Effect.provideService(DocumentManagerTag, documentManager),
      Effect.scoped
    );
});
