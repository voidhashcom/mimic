import {
  Effect,
  HashMap,
  PubSub,
  Ref,
  ServiceMap,
  Stream,
  Layer,
} from "effect";
import type { Scope } from "effect/Scope";
import { Transaction } from "@voidhash/mimic";
import { MimicDocumentEntity, type SubmitResult } from "./DocumentEntity";
import { DocumentGatewayError } from "./Errors";
import type * as Protocol from "./Protocol";
import type { PresenceEntry } from "./Protocol";
import type { PresenceEvent, PresenceSnapshot } from "./Presence";

export interface DocumentGateway {
  readonly submit: (
    collectionId: string,
    documentId: string,
    transaction: Transaction.Transaction,
  ) => Effect.Effect<SubmitResult>;
  readonly getSnapshot: (
    collectionId: string,
    documentId: string,
  ) => Effect.Effect<{ state: unknown; version: number }, DocumentGatewayError>;
  readonly getTreeSnapshot: (
    collectionId: string,
    documentId: string,
  ) => Effect.Effect<unknown, DocumentGatewayError>;
  readonly subscribe: (
    collectionId: string,
    documentId: string,
  ) => Effect.Effect<Stream.Stream<Protocol.ServerMessage>, never, Scope>;
  readonly touch: (collectionId: string, documentId: string) => Effect.Effect<void, DocumentGatewayError>;
  readonly getPresenceSnapshot: (
    collectionId: string,
    documentId: string,
  ) => Effect.Effect<PresenceSnapshot, DocumentGatewayError>;
  readonly setPresence: (
    collectionId: string,
    documentId: string,
    connectionId: string,
    entry: PresenceEntry,
  ) => Effect.Effect<void, DocumentGatewayError>;
  readonly removePresence: (
    collectionId: string,
    documentId: string,
    connectionId: string,
  ) => Effect.Effect<void, DocumentGatewayError>;
  readonly subscribePresence: (
    collectionId: string,
    documentId: string,
  ) => Effect.Effect<Stream.Stream<PresenceEvent>, never, Scope>;
}

export class DocumentGatewayTag extends ServiceMap.Service<DocumentGatewayTag, DocumentGateway>()(
  "@voidhash/mimic-host/DocumentGateway",
) {}

export const DocumentGatewayLive = Layer.effect(
  DocumentGatewayTag,
  Effect.gen(function* () {
    const makeClient = yield* MimicDocumentEntity.client;

    // Local PubSub stores for subscriptions (entities don't stream)
    const documentPubSubs = yield* Ref.make(
      HashMap.empty<string, PubSub.PubSub<Protocol.ServerMessage>>(),
    );
    const presencePubSubs = yield* Ref.make(
      HashMap.empty<string, PubSub.PubSub<PresenceEvent>>(),
    );

    const getOrCreateDocPubSub = (key: string) =>
      Effect.gen(function* () {
        const current = yield* Ref.get(documentPubSubs);
        const existing = HashMap.get(current, key);
        if (existing._tag === "Some") return existing.value;

        const pubsub = yield* PubSub.unbounded<Protocol.ServerMessage>();
        yield* Ref.update(documentPubSubs, (map) => HashMap.set(map, key, pubsub));
        return pubsub;
      });

    const getOrCreatePresencePubSub = (key: string) =>
      Effect.gen(function* () {
        const current = yield* Ref.get(presencePubSubs);
        const existing = HashMap.get(current, key);
        if (existing._tag === "Some") return existing.value;

        const pubsub = yield* PubSub.unbounded<PresenceEvent>();
        yield* Ref.update(presencePubSubs, (map) => HashMap.set(map, key, pubsub));
        return pubsub;
      });

    const entityId = (collectionId: string, documentId: string) =>
      `${collectionId}:${documentId}`;

    const mapClusterError = (operation: string) => (cause: unknown) =>
      new DocumentGatewayError({ message: `Cluster error during ${operation}`, cause });

    const gateway: DocumentGateway = {
      submit: (collectionId, documentId, transaction) =>
        Effect.gen(function* () {
          const client = makeClient(entityId(collectionId, documentId));
          const encodedTx = Transaction.encode(transaction);
          const result = yield* client
            .Submit({ transaction: encodedTx as unknown as { id: string; ops: unknown[] } })
            .pipe(
              Effect["catch"]((error) =>
                Effect.succeed({
                  success: false as const,
                  reason: `Cluster error: ${String(error)}`,
                }),
              ),
            );

          // Broadcast to local subscribers on success
          if (result.success) {
            const pubsub = yield* getOrCreateDocPubSub(entityId(collectionId, documentId));
            yield* PubSub.publish(pubsub, {
              type: "transaction",
              transaction,
              version: result.version,
            } as Protocol.ServerMessage);
          }

          return result;
        }),

      getSnapshot: (collectionId, documentId) =>
        Effect.gen(function* () {
          const client = makeClient(entityId(collectionId, documentId));
          return yield* client.GetSnapshot(undefined as void).pipe(
            Effect.mapError(mapClusterError("GetSnapshot")),
          );
        }),

      getTreeSnapshot: (collectionId, documentId) =>
        Effect.gen(function* () {
          const client = makeClient(entityId(collectionId, documentId));
          return yield* client.GetTreeSnapshot(undefined as void).pipe(
            Effect.mapError(mapClusterError("GetTreeSnapshot")),
          );
        }),

      subscribe: (collectionId, documentId) =>
        Effect.gen(function* () {
          const pubsub = yield* getOrCreateDocPubSub(entityId(collectionId, documentId));
          return Stream.fromPubSub(pubsub);
        }),

      touch: (collectionId, documentId) =>
        Effect.gen(function* () {
          const client = makeClient(entityId(collectionId, documentId));
          yield* client.Touch(undefined as void).pipe(
            Effect.mapError(mapClusterError("Touch")),
          );
        }),

      getPresenceSnapshot: (collectionId, documentId) =>
        Effect.gen(function* () {
          const client = makeClient(entityId(collectionId, documentId));
          return yield* client.GetPresenceSnapshot(undefined as void).pipe(
            Effect.mapError(mapClusterError("GetPresenceSnapshot")),
          );
        }),

      setPresence: (collectionId, documentId, connectionId, entry) =>
        Effect.gen(function* () {
          const client = makeClient(entityId(collectionId, documentId));
          yield* client.SetPresence({ connectionId, entry }).pipe(
            Effect.mapError(mapClusterError("SetPresence")),
          );

          const pubsub = yield* getOrCreatePresencePubSub(entityId(collectionId, documentId));
          yield* PubSub.publish(pubsub, {
            type: "presence_update",
            id: connectionId,
            data: entry.data,
            userId: entry.userId,
          });
        }),

      removePresence: (collectionId, documentId, connectionId) =>
        Effect.gen(function* () {
          const client = makeClient(entityId(collectionId, documentId));
          yield* client.RemovePresence({ connectionId }).pipe(
            Effect.mapError(mapClusterError("RemovePresence")),
          );

          const pubsub = yield* getOrCreatePresencePubSub(entityId(collectionId, documentId));
          yield* PubSub.publish(pubsub, {
            type: "presence_remove",
            id: connectionId,
          });
        }),

      subscribePresence: (collectionId, documentId) =>
        Effect.gen(function* () {
          const pubsub = yield* getOrCreatePresencePubSub(entityId(collectionId, documentId));
          return Stream.fromPubSub(pubsub);
        }),
    };

    return gateway;
  }),
);
