/**
 * @since 0.0.1
 * Document manager that handles multiple document instances.
 */
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as HashMap from "effect/HashMap";
import * as Context from "effect/Context";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import type { Primitive, Transaction } from "@voidhash/mimic";
import { ServerDocument } from "@voidhash/mimic/server";

import * as Protocol from "./DocumentProtocol.js";
import { MimicServerConfigTag } from "./MimicConfig.js";
import { MimicDataStorageTag } from "./MimicDataStorage.js";
import { DocumentNotFoundError } from "./errors.js";

// =============================================================================
// Document Instance
// =============================================================================

/**
 * A managed document instance that holds state and manages subscribers.
 */
interface DocumentInstance {
  /** The underlying ServerDocument */
  readonly document: ServerDocument.ServerDocument<Primitive.AnyPrimitive>;
  /** PubSub for broadcasting messages to subscribers */
  readonly pubsub: PubSub.PubSub<Protocol.ServerBroadcast>;
  /** Reference count for cleanup */
  readonly refCount: Ref.Ref<number>;
}

// =============================================================================
// Document Manager Service
// =============================================================================

/**
 * Service interface for the DocumentManager.
 */
export interface DocumentManager {
  /**
   * Submit a transaction to a document.
   */
  readonly submit: (
    documentId: string,
    transaction: Transaction.Transaction
  ) => Effect.Effect<Protocol.SubmitResult>;

  /**
   * Get a snapshot of a document.
   */
  readonly getSnapshot: (
    documentId: string
  ) => Effect.Effect<Protocol.SnapshotMessage>;

  /**
   * Subscribe to broadcasts for a document.
   * Returns a Stream of server broadcasts.
   */
  readonly subscribe: (
    documentId: string
  ) => Effect.Effect<
    Stream.Stream<Protocol.ServerBroadcast>,
    never,
    Scope.Scope
  >;
}

/**
 * Context tag for DocumentManager.
 */
export class DocumentManagerTag extends Context.Tag(
  "@voidhash/mimic-server-effect/DocumentManager"
)<DocumentManagerTag, DocumentManager>() {}

// =============================================================================
// Document Manager Implementation
// =============================================================================

/**
 * Create the DocumentManager service.
 */
const makeDocumentManager = Effect.gen(function* () {
  const config = yield* MimicServerConfigTag;
  const storage = yield* MimicDataStorageTag;
  
  // Map of document ID to document instance
  const documents = yield* Ref.make(
    HashMap.empty<string, DocumentInstance>()
  );

  // Get or create a document instance
  const getOrCreateDocument = (
    documentId: string
  ): Effect.Effect<DocumentInstance> =>
    Effect.gen(function* () {
      const current = yield* Ref.get(documents);
      const existing = HashMap.get(current, documentId);

      if (existing._tag === "Some") {
        // Increment ref count
        yield* Ref.update(existing.value.refCount, (n) => n + 1);
        return existing.value;
      }

      // Load initial state from storage
      const rawState = yield* Effect.catchAll(
        storage.load(documentId),
        () => Effect.succeed(undefined)
      );

      // Transform loaded state with onLoad hook, or compute initial state for new docs
      const initialState = rawState !== undefined
        ? yield* storage.onLoad(rawState)
        : config.initial !== undefined
          ? yield* config.initial({ documentId })
          : undefined;

      // Create PubSub for broadcasting
      const pubsub = yield* PubSub.unbounded<Protocol.ServerBroadcast>();

      // Create ServerDocument with broadcast callback
      const serverDocument = ServerDocument.make({
        schema: config.schema,
        initialState: initialState as Primitive.InferSetInput<typeof config.schema> | undefined,
        maxTransactionHistory: config.maxTransactionHistory,
        onBroadcast: (transactionMessage) => {
          // Get current state and save to storage
          const currentState = serverDocument.get();
          
          // Run save in background (fire-and-forget with error logging)
          Effect.runFork(
            Effect.gen(function* () {
              if (currentState !== undefined) {
                const transformedState = yield* storage.onSave(currentState);
                yield* Effect.catchAll(
                  storage.save(documentId, transformedState),
                  (error) => Effect.logError("Failed to save document", error)
                );
              }
            })
          );

          // Broadcast to subscribers
          Effect.runSync(
            PubSub.publish(pubsub, {
              type: "transaction",
              transaction: transactionMessage.transaction as Protocol.Transaction,
              version: transactionMessage.version,
            })
          );
        },
        onRejection: (transactionId, reason) => {
          Effect.runSync(
            PubSub.publish(pubsub, {
              type: "error",
              transactionId,
              reason,
            })
          );
        },
      });

      const refCount = yield* Ref.make(1);

      const instance: DocumentInstance = {
        document: serverDocument,
        pubsub,
        refCount,
      };

      // Store in map
      yield* Ref.update(documents, (map) =>
        HashMap.set(map, documentId, instance)
      );

      return instance;
    });

  // Submit a transaction
  const submit = (
    documentId: string,
    transaction: Transaction.Transaction
  ): Effect.Effect<Protocol.SubmitResult> =>
    Effect.gen(function* () {
      const instance = yield* getOrCreateDocument(documentId);
      const result = instance.document.submit(transaction);
      return result;
    });

  // Get a snapshot
  const getSnapshot = (
    documentId: string
  ): Effect.Effect<Protocol.SnapshotMessage> =>
    Effect.gen(function* () {
      const instance = yield* getOrCreateDocument(documentId);
      const snapshot = instance.document.getSnapshot();
      return snapshot;
    });

  // Subscribe to broadcasts
  const subscribe = (
    documentId: string
  ): Effect.Effect<
    Stream.Stream<Protocol.ServerBroadcast>,
    never,
    Scope.Scope
  > =>
    Effect.gen(function* () {
      const instance = yield* getOrCreateDocument(documentId);

      // Subscribe to the PubSub
      const queue = yield* PubSub.subscribe(instance.pubsub);

      // Ensure cleanup on scope close
      yield* Effect.addFinalizer(() =>
        Effect.gen(function* () {
          // Decrement ref count
          const count = yield* Ref.updateAndGet(
            instance.refCount,
            (n) => n - 1
          );

          // If no more subscribers, we could clean up the document
          // For now, we keep it alive (could add idle timeout)
        })
      );

      // Convert queue to stream
      return Stream.fromQueue(queue);
    });

  const manager: DocumentManager = {
    submit,
    getSnapshot,
    subscribe,
  };

  return manager;
});

/**
 * Layer that provides DocumentManager.
 * Requires MimicServerConfigTag and MimicDataStorageTag.
 */
export const layer: Layer.Layer<
  DocumentManagerTag,
  never,
  MimicServerConfigTag | MimicDataStorageTag
> = Layer.effect(DocumentManagerTag, makeDocumentManager);
