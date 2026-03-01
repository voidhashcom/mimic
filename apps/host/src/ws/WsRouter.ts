import { Effect, Fiber, Layer, Stream } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import type * as Socket from "effect/unstable/socket";
import { Presence } from "@voidhash/mimic";
import { DocumentGatewayTag } from "../engine/DocumentGateway";
import { AuthServiceTag, type AuthContext } from "../auth/AuthService";
import { CollectionRepositoryTag } from "../mysql/CollectionRepository";
import { SchemaJSON } from "@voidhash/mimic";
import * as Protocol from "../engine/Protocol";

interface ConnectionState {
  readonly databaseId: string;
  readonly collectionId: string;
  readonly documentId: string;
  readonly connectionId: string;
  authenticated: boolean;
  authContext?: AuthContext;
  hasPresence: boolean;
}

const handleWebSocketConnection = (
  socket: Socket.Socket.Socket,
  databaseId: string,
  collectionId: string,
  documentId: string,
) =>
  Effect.gen(function* () {
    const gateway = yield* DocumentGatewayTag;
    const authService = yield* AuthServiceTag;
    const collectionRepo = yield* CollectionRepositoryTag;

    const connectionId = crypto.randomUUID();

    const state: ConnectionState = {
      databaseId,
      collectionId,
      documentId,
      connectionId,
      authenticated: false,
      hasPresence: false,
    };

    // Load collection schema for presence validation
    const collection = yield* collectionRepo.findById(collectionId);
    const schema = collection ? SchemaJSON.fromJSON(collection.schemaJson) : undefined;

    const write = yield* socket.writer;

    const sendMessage = (message: Protocol.ServerMessage) =>
      write(Protocol.encodeServerMessage(message));

    const handleAuth = (token: string) =>
      Effect.gen(function* () {
        const result = yield* Effect.result(
          authService.authenticate(token, databaseId, documentId),
        );

        if (result._tag === "Success") {
          state.authenticated = true;
          state.authContext = result.success;

          yield* sendMessage(
            Protocol.authResultSuccess(result.success.userId, result.success.permission),
          );

          // Send document snapshot
          const snapshot = yield* gateway.getSnapshot(collectionId, documentId);
          yield* sendMessage(Protocol.snapshotMessage(snapshot.state, snapshot.version));

          // Send presence snapshot
          const presenceSnapshot = yield* gateway.getPresenceSnapshot(collectionId, documentId);
          yield* sendMessage(
            Protocol.presenceSnapshotMessage(connectionId, presenceSnapshot.presences),
          );
        } else {
          yield* sendMessage(
            Protocol.authResultFailure(result.failure.reason ?? "Authentication failed"),
          );
        }
      });

    const handleMessage = (message: Protocol.ClientMessage) =>
      Effect.gen(function* () {
        yield* gateway.touch(collectionId, documentId);

        switch (message.type) {
          case "auth":
            yield* handleAuth(message.token);
            break;

          case "ping":
            yield* sendMessage(Protocol.pong());
            break;

          case "submit":
            if (!state.authenticated) {
              yield* sendMessage(Protocol.errorMessage(message.transaction.id, "Not authenticated"));
              return;
            }
            if (state.authContext?.permission !== "write") {
              yield* sendMessage(
                Protocol.errorMessage(message.transaction.id, "Write permission required"),
              );
              return;
            }

            const submitResult = yield* gateway.submit(collectionId, documentId, message.transaction);
            if (!submitResult.success) {
              yield* sendMessage(Protocol.errorMessage(message.transaction.id, submitResult.reason));
            }
            break;

          case "request_snapshot":
            if (!state.authenticated) return;
            const snap = yield* gateway.getSnapshot(collectionId, documentId);
            yield* sendMessage(Protocol.snapshotMessage(snap.state, snap.version));
            break;

          case "presence_set":
            if (!state.authenticated || !state.authContext) return;
            if (state.authContext.permission !== "write") return;

            yield* gateway.setPresence(collectionId, documentId, connectionId, {
              data: message.data,
              userId: state.authContext.userId,
            });
            state.hasPresence = true;
            break;

          case "presence_clear":
            if (!state.authenticated) return;
            yield* gateway.removePresence(collectionId, documentId, connectionId);
            state.hasPresence = false;
            break;
        }
      });

    // Subscribe to document broadcasts
    const subscribeFiber = yield* Effect.forkChild(
      Effect.gen(function* () {
        while (!state.authenticated) {
          yield* Effect.sleep("100 millis");
        }

        const broadcastStream = yield* gateway.subscribe(collectionId, documentId);
        yield* Stream.runForEach(broadcastStream, (broadcast) =>
          sendMessage(broadcast as Protocol.ServerMessage),
        );
      }).pipe(Effect.scoped),
    );

    // Subscribe to presence events
    const presenceFiber = yield* Effect.forkChild(
      Effect.gen(function* () {
        while (!state.authenticated) {
          yield* Effect.sleep("100 millis");
        }

        const presenceStream = yield* gateway.subscribePresence(collectionId, documentId);
        yield* Stream.runForEach(presenceStream, (event) =>
          Effect.gen(function* () {
            if (event.id === connectionId) return;

            if (event.type === "presence_update") {
              yield* sendMessage(
                Protocol.presenceUpdateMessage(event.id, event.data, event.userId),
              );
            } else if (event.type === "presence_remove") {
              yield* sendMessage(Protocol.presenceRemoveMessage(event.id));
            }
          }),
        );
      }).pipe(Effect.scoped),
    );

    // Cleanup on disconnect
    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        yield* Fiber.interrupt(subscribeFiber);
        yield* Fiber.interrupt(presenceFiber);

        if (state.hasPresence) {
          yield* gateway.removePresence(collectionId, documentId, connectionId);
        }
      }),
    );

    // Process incoming messages
    yield* socket.runRaw((data: string | Uint8Array) =>
      Effect.gen(function* () {
        const message = yield* Protocol.parseClientMessage(data);
        yield* handleMessage(message);
      }).pipe(
        Effect["catch"]((error) => Effect.logError("Message handling error", error)),
      ),
    );
  });

export const WsRoute = Layer.effectDiscard(
  Effect.gen(function* () {
    const router = yield* HttpRouter.HttpRouter;

    yield* router.add(
      "GET",
      "/ws/:databaseId/:collectionId/doc/:documentId" as HttpRouter.PathInput,
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;

        // Extract path params
        const parts = request.url.replace(/^\/+/, "").split("/");
        // Expected: ws/:databaseId/:collectionId/doc/:documentId
        const wsIndex = parts.indexOf("ws");
        const databaseId = parts[wsIndex + 1];
        const collectionId = parts[wsIndex + 2];
        const docIndex = parts.indexOf("doc");
        const documentId = parts[docIndex + 1];

        if (!databaseId || !collectionId || !documentId) {
          return HttpServerResponse.text("Missing path parameters", { status: 400 });
        }

        const socket = yield* request.upgrade;

        yield* handleWebSocketConnection(
          socket,
          decodeURIComponent(databaseId),
          decodeURIComponent(collectionId),
          decodeURIComponent(documentId),
        ).pipe(
          Effect.scoped,
          Effect["catch"]((error) => Effect.logError("WebSocket connection error", error)),
        );

        return HttpServerResponse.empty();
      }),
    );
  }),
);
