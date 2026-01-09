/**
 * @voidhash/mimic-effect - MimicServer
 *
 * WebSocket route layer for MimicServerEngine.
 * Creates routes compatible with HttpLayerRouter.
 */
import {
  Duration,
  Effect,
  Fiber,
  Layer,
  Metric,
  Scope,
  Stream,
} from "effect";
import {
  HttpLayerRouter,
  HttpServerRequest,
  HttpServerResponse,
} from "@effect/platform";
import type * as Socket from "@effect/platform/Socket";
import { Presence } from "@voidhash/mimic";
import type { MimicServerRouteConfig, ResolvedRouteConfig } from "./Types";
import * as Protocol from "./Protocol";
import { MissingDocumentIdError } from "./Errors";
import { MimicServerEngineTag, type MimicServerEngine } from "./MimicServerEngine";
import { MimicAuthServiceTag, type MimicAuthService } from "./MimicAuthService";
import * as Metrics from "./Metrics";
import type { AuthContext } from "./Types";

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_PATH = "/mimic";
const DEFAULT_HEARTBEAT_INTERVAL = Duration.seconds(30);
const DEFAULT_HEARTBEAT_TIMEOUT = Duration.seconds(10);

/**
 * Resolve route configuration with defaults
 */
const resolveRouteConfig = (
  config?: MimicServerRouteConfig
): ResolvedRouteConfig => ({
  path: config?.path ?? DEFAULT_PATH,
  heartbeatInterval: config?.heartbeatInterval
    ? Duration.decode(config.heartbeatInterval)
    : DEFAULT_HEARTBEAT_INTERVAL,
  heartbeatTimeout: config?.heartbeatTimeout
    ? Duration.decode(config.heartbeatTimeout)
    : DEFAULT_HEARTBEAT_TIMEOUT,
});

// =============================================================================
// URL Path Parsing
// =============================================================================

/**
 * Extract document ID from URL path.
 * Expected format: /basePath/doc/{documentId}
 */
const extractDocumentId = (
  path: string
): Effect.Effect<string, MissingDocumentIdError> => {
  // Remove leading slash and split
  const parts = path.replace(/^\/+/, "").split("/");

  // Find the last occurrence of 'doc' in the path
  const docIndex = parts.lastIndexOf("doc");
  const part = parts[docIndex + 1];
  if (docIndex !== -1 && part) {
    return Effect.succeed(decodeURIComponent(part));
  }
  return Effect.fail(new MissingDocumentIdError({ path }));
};

// =============================================================================
// Connection State
// =============================================================================

interface ConnectionState {
  readonly documentId: string;
  readonly connectionId: string;
  authenticated: boolean;
  authContext?: AuthContext;
  hasPresence: boolean;
}

// =============================================================================
// WebSocket Connection Handler
// =============================================================================

/**
 * Handle a WebSocket connection for a document.
 */
const handleWebSocketConnection = (
  socket: Socket.Socket,
  documentId: string,
  engine: MimicServerEngine,
  authService: MimicAuthService,
  _routeConfig: ResolvedRouteConfig
): Effect.Effect<void, Socket.SocketError, Scope.Scope> =>
  Effect.gen(function* () {
    const connectionId = crypto.randomUUID();
    const connectionStartTime = Date.now();

    // Track connection metrics
    yield* Metric.increment(Metrics.connectionsTotal);
    yield* Metric.incrementBy(Metrics.connectionsActive, 1);

    // Track connection state (mutable for simplicity)
    const state: ConnectionState = {
      documentId,
      connectionId,
      authenticated: false,
      hasPresence: false,
    };

    // Get the socket writer
    const write = yield* socket.writer;

    // Helper to send a message to the client
    const sendMessage = (message: Protocol.ServerMessage) =>
      write(Protocol.encodeServerMessage(message));

    // Send presence snapshot after auth
    const sendPresenceSnapshot = Effect.gen(function* () {
      if (!engine.config.presence) return;

      const snapshot = yield* engine.getPresenceSnapshot(documentId);
      yield* sendMessage(
        Protocol.presenceSnapshotMessage(connectionId, snapshot.presences)
      );
    });

    // Send document snapshot after auth
    const sendDocumentSnapshot = Effect.gen(function* () {
      const snapshot = yield* engine.getSnapshot(documentId);
      yield* sendMessage(
        Protocol.snapshotMessage(snapshot.state, snapshot.version)
      );
    });

    // Handle authentication
    const handleAuth = (token: string) =>
      Effect.gen(function* () {
        const result = yield* Effect.either(
          authService.authenticate(token, documentId)
        );

        if (result._tag === "Right") {
          state.authenticated = true;
          state.authContext = result.right;

          yield* sendMessage(
            Protocol.authResultSuccess(
              result.right.userId,
              result.right.permission
            )
          );

          // Send document snapshot after successful auth
          yield* sendDocumentSnapshot;

          // Send presence snapshot after successful auth
          yield* sendPresenceSnapshot;
        } else {
          yield* Metric.increment(Metrics.connectionsErrors);
          yield* sendMessage(
            Protocol.authResultFailure(
              result.left.reason ?? "Authentication failed"
            )
          );
        }
      });

    // Handle presence set
    const handlePresenceSet = (data: unknown) =>
      Effect.gen(function* () {
        if (!state.authenticated) return;
        if (!state.authContext) return;
        if (!engine.config.presence) return;

        // Check write permission
        if (state.authContext.permission !== "write") {
          yield* Effect.logWarning("Presence set rejected - read-only user", {
            connectionId,
          });
          return;
        }

        // Validate presence data against schema
        const validated = Presence.validateSafe(engine.config.presence, data);
        if (validated === undefined) {
          yield* Effect.logWarning("Invalid presence data received", {
            connectionId,
            data,
          });
          return;
        }

        // Store in engine
        yield* engine.setPresence(documentId, connectionId, {
          data: validated,
          userId: state.authContext.userId,
        });

        state.hasPresence = true;
      });

    // Handle presence clear
    const handlePresenceClear = Effect.gen(function* () {
      if (!state.authenticated) return;
      if (!engine.config.presence) return;

      yield* engine.removePresence(documentId, connectionId);
      state.hasPresence = false;
    });

    // Handle a client message
    const handleMessage = (message: Protocol.ClientMessage) =>
      Effect.gen(function* () {
        // Touch document on any activity (prevents idle GC)
        yield* engine.touch(documentId);

        switch (message.type) {
          case "auth":
            yield* handleAuth(message.token);
            break;

          case "ping":
            yield* sendMessage(Protocol.pong());
            break;

          case "submit":
            if (!state.authenticated) {
              yield* sendMessage(
                Protocol.errorMessage(
                  message.transaction.id,
                  "Not authenticated"
                )
              );
              return;
            }

            // Check write permission
            if (state.authContext?.permission !== "write") {
              yield* sendMessage(
                Protocol.errorMessage(
                  message.transaction.id,
                  "Write permission required"
                )
              );
              return;
            }

            // Submit to the engine
            const submitResult = yield* engine.submit(
              documentId,
              message.transaction
            );

            // If rejected, send error (success is broadcast to all)
            if (!submitResult.success) {
              yield* sendMessage(
                Protocol.errorMessage(message.transaction.id, submitResult.reason)
              );
            }
            break;

          case "request_snapshot":
            if (!state.authenticated) {
              return;
            }
            const snapshot = yield* engine.getSnapshot(documentId);
            yield* sendMessage(
              Protocol.snapshotMessage(snapshot.state, snapshot.version)
            );
            break;

          case "presence_set":
            yield* handlePresenceSet(message.data);
            break;

          case "presence_clear":
            yield* handlePresenceClear;
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
        const broadcastStream = yield* engine.subscribe(documentId);

        // Forward broadcasts to the WebSocket
        yield* Stream.runForEach(broadcastStream, (broadcast) =>
          sendMessage(broadcast as Protocol.ServerMessage)
        );
      }).pipe(Effect.scoped)
    );

    // Subscribe to presence events (if presence is enabled)
    const presenceFiber = yield* Effect.fork(
      Effect.gen(function* () {
        if (!engine.config.presence) return;

        // Wait until authenticated before subscribing
        while (!state.authenticated) {
          yield* Effect.sleep(Duration.millis(100));
        }

        // Subscribe to presence events
        const presenceStream = yield* engine.subscribePresence(documentId);

        // Forward presence events to the WebSocket, filtering out our own events (no-echo)
        yield* Stream.runForEach(presenceStream, (event) =>
          Effect.gen(function* () {
            // Don't echo our own presence events
            if (event.id === connectionId) return;

            if (event.type === "presence_update") {
              yield* sendMessage(
                Protocol.presenceUpdateMessage(event.id, event.data, event.userId)
              );
            } else if (event.type === "presence_remove") {
              yield* sendMessage(Protocol.presenceRemoveMessage(event.id));
            }
          })
        );
      }).pipe(Effect.scoped)
    );

    // Ensure cleanup on disconnect
    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        // Calculate connection duration
        const duration = Date.now() - connectionStartTime;

        // Interrupt the subscribe fibers
        yield* Fiber.interrupt(subscribeFiber);
        yield* Fiber.interrupt(presenceFiber);

        // Remove presence if we had any
        if (state.hasPresence && engine.config.presence) {
          yield* engine.removePresence(documentId, connectionId);
        }

        // Update connection metrics
        yield* Metric.incrementBy(Metrics.connectionsActive, -1);
        yield* Metric.update(Metrics.connectionsDuration, duration);

        yield* Effect.logDebug("WebSocket connection closed", {
          connectionId,
          documentId,
          durationMs: duration,
        });
      })
    );

    // Process incoming messages
    yield* socket.runRaw((data) =>
      Effect.gen(function* () {
        const message = yield* Protocol.parseClientMessage(data);
        yield* handleMessage(message);
      }).pipe(
        Effect.catchAll((error) =>
          Effect.logError("Message handling error", error)
        )
      )
    );
  });

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a route layer for MimicServerEngine.
 *
 * This creates a WebSocket route that connects to the engine.
 * Use Layer.mergeAll to compose with other routes.
 *
 * @example
 * ```typescript
 * // 1. Create the engine
 * const Engine = MimicServerEngine.make({
 *   schema: DocSchema,
 *   initial: { title: "Untitled" },
 * })
 *
 * // 2. Create the WebSocket route
 * const MimicRoute = MimicServer.layerHttpLayerRouter({
 *   path: "/mimic",
 * })
 *
 * // 3. Wire together
 * const MimicLive = MimicRoute.pipe(
 *   Layer.provide(Engine),
 *   Layer.provide(ColdStorage.InMemory.make()),
 *   Layer.provide(HotStorage.InMemory.make()),
 *   Layer.provide(MimicAuthService.NoAuth.make()),
 * )
 *
 * // 4. Compose with other routes
 * const AllRoutes = Layer.mergeAll(MimicLive, DocsRoute, OtherRoutes)
 *
 * // 5. Serve
 * HttpLayerRouter.serve(AllRoutes).pipe(
 *   Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })),
 *   Layer.launch,
 *   NodeRuntime.runMain
 * )
 * ```
 */
export const layerHttpLayerRouter = (
  options?: MimicServerRouteConfig
) => {
  const routeConfig = resolveRouteConfig(options);

  // Build the route path pattern: {path}/doc/:documentId
  const routePath =
    `${routeConfig.path}/doc/:documentId` as HttpLayerRouter.PathInput;

  return Layer.scopedDiscard(
    Effect.gen(function* () {
      const router = yield* HttpLayerRouter.HttpRouter;
      // Capture engine and auth service at layer creation time
      const engine = yield* MimicServerEngineTag;
      const authService = yield* MimicAuthServiceTag;

      // Create the handler that receives the request
      // Engine and authService are captured in closure, not yielded per-request
      const handler = (request: HttpServerRequest.HttpServerRequest) =>
        Effect.gen(function* () {
          // Extract document ID from path
          const documentIdResult = yield* Effect.either(
            extractDocumentId(request.url)
          );
          if (documentIdResult._tag === "Left") {
            return HttpServerResponse.text(
              `Missing document ID in path: ${request.url}`,
              { status: 400 }
            );
          }
          const documentId = documentIdResult.right;

          // Upgrade to WebSocket
          const socket = yield* request.upgrade;

          // Handle the WebSocket connection
          yield* handleWebSocketConnection(
            socket,
            documentId,
            engine,
            authService,
            routeConfig
          ).pipe(
            Effect.scoped,
            Effect.catchAll((error) =>
              Effect.logError("WebSocket connection error", error)
            )
          );

          // Return empty response - the WebSocket upgrade handles the connection
          return HttpServerResponse.empty();
        });

      yield* router.add("GET", routePath, handler);
    })
  );
};

// =============================================================================
// Re-export namespace
// =============================================================================

export const MimicServer = {
  layerHttpLayerRouter,
};

// =============================================================================
// Re-export types
// =============================================================================

export type { MimicServerRouteConfig };
