/**
 * @voidhash/mimic-effect - DocumentManager
 *
 * Internal service for managing document lifecycle, including:
 * - Document creation and restoration
 * - Transaction processing
 * - WAL management
 * - Snapshot scheduling
 * - Idle document GC
 */
import {
  Context,
  Duration,
  Effect,
  Fiber,
  HashMap,
  Layer,
  Metric,
  PubSub,
  Ref,
  Schedule,
  Scope,
  Stream,
} from "effect";
import { Primitive, Transaction } from "@voidhash/mimic";
import { ServerDocument } from "@voidhash/mimic/server";
import type {
  Initial,
  ResolvedConfig,
  StoredDocument,
  WalEntry,
} from "./Types.js";
import type { SnapshotMessage, ServerBroadcast } from "./Protocol.js";
import { ColdStorageTag, type ColdStorage } from "./ColdStorage.js";
import { HotStorageTag, type HotStorage } from "./HotStorage.js";
import * as Metrics from "./Metrics.js";

// =============================================================================
// Submit Result Types
// =============================================================================

/**
 * Result of submitting a transaction
 */
export type SubmitResult =
  | { readonly success: true; readonly version: number }
  | { readonly success: false; readonly reason: string };

// =============================================================================
// DocumentManager Interface
// =============================================================================

/**
 * Internal service for managing document lifecycle.
 */
export interface DocumentManager {
  /**
   * Submit a transaction to a document.
   */
  readonly submit: (
    documentId: string,
    transaction: Transaction.Transaction
  ) => Effect.Effect<SubmitResult>;

  /**
   * Get a snapshot of a document.
   */
  readonly getSnapshot: (documentId: string) => Effect.Effect<SnapshotMessage>;

  /**
   * Subscribe to broadcasts for a document.
   */
  readonly subscribe: (
    documentId: string
  ) => Effect.Effect<Stream.Stream<ServerBroadcast>, never, Scope.Scope>;

  /**
   * Touch a document to update its last activity time.
   * Call this on any client activity to prevent idle GC.
   */
  readonly touch: (documentId: string) => Effect.Effect<void>;
}

// =============================================================================
// Context Tag
// =============================================================================

/**
 * Context tag for DocumentManager service
 */
export class DocumentManagerTag extends Context.Tag(
  "@voidhash/mimic-effect/DocumentManager"
)<DocumentManagerTag, DocumentManager>() {}

// =============================================================================
// Internal Types
// =============================================================================

/**
 * Document instance state
 */
interface DocumentInstance<TSchema extends Primitive.AnyPrimitive> {
  /** The underlying ServerDocument */
  readonly document: ServerDocument.ServerDocument<TSchema>;
  /** PubSub for broadcasting messages */
  readonly pubsub: PubSub.PubSub<ServerBroadcast>;
  /** Version at last snapshot */
  readonly lastSnapshotVersion: Ref.Ref<number>;
  /** Timestamp of last snapshot (ms) */
  readonly lastSnapshotTime: Ref.Ref<number>;
  /** Transactions since last snapshot */
  readonly transactionsSinceSnapshot: Ref.Ref<number>;
  /** Last activity timestamp (ms) */
  readonly lastActivityTime: Ref.Ref<number>;
}

// =============================================================================
// Config Context Tag
// =============================================================================

/**
 * Context tag for DocumentManager configuration
 */
export class DocumentManagerConfigTag extends Context.Tag(
  "@voidhash/mimic-effect/DocumentManagerConfig"
)<DocumentManagerConfigTag, ResolvedConfig<Primitive.AnyPrimitive>>() {}

// =============================================================================
// Layer Implementation
// =============================================================================

/**
 * Create the DocumentManager layer.
 * Requires ColdStorage, HotStorage, and DocumentManagerConfig.
 */
export const layer: Layer.Layer<
  DocumentManagerTag,
  never,
  ColdStorageTag | HotStorageTag | DocumentManagerConfigTag
> = Layer.scoped(
  DocumentManagerTag,
  Effect.gen(function* () {
    const coldStorage = yield* ColdStorageTag;
    const hotStorage = yield* HotStorageTag;
    const config = yield* DocumentManagerConfigTag;

    // Store: documentId -> DocumentInstance
    const store = yield* Ref.make(
      HashMap.empty<string, DocumentInstance<Primitive.AnyPrimitive>>()
    );

    // Current schema version (hard-coded to 1 for now)
    const SCHEMA_VERSION = 1;

    /**
     * Compute initial state for a new document
     */
    const computeInitialState = (
      documentId: string
    ): Effect.Effect<Primitive.InferSetInput<typeof config.schema> | undefined> => {
      if (config.initial === undefined) {
        return Effect.succeed(undefined);
      }

      // Check if it's a function or static value
      if (typeof config.initial === "function") {
        return (config.initial as (ctx: { documentId: string }) => Effect.Effect<Primitive.InferSetInput<typeof config.schema>>)({ documentId });
      }

      return Effect.succeed(config.initial as Primitive.InferSetInput<typeof config.schema>);
    };

    /**
     * Restore a document from storage
     */
    const restoreDocument = (
      documentId: string
    ): Effect.Effect<DocumentInstance<typeof config.schema>> =>
      Effect.gen(function* () {
        // 1. Load snapshot from ColdStorage
        const storedDoc = yield* Effect.catchAll(
          coldStorage.load(documentId),
          () => Effect.succeed(undefined)
        );

        let initialState: Primitive.InferSetInput<typeof config.schema> | undefined;
        let initialVersion = 0;

        if (storedDoc) {
          // Use stored state
          initialState = storedDoc.state as Primitive.InferSetInput<typeof config.schema>;
          initialVersion = storedDoc.version;
        } else {
          // Compute initial state
          initialState = yield* computeInitialState(documentId);
        }

        // 2. Create PubSub for broadcasting
        const pubsub = yield* PubSub.unbounded<ServerBroadcast>();

        // 3. Create refs for tracking
        const lastSnapshotVersion = yield* Ref.make(initialVersion);
        const lastSnapshotTime = yield* Ref.make(Date.now());
        const transactionsSinceSnapshot = yield* Ref.make(0);
        const lastActivityTime = yield* Ref.make(Date.now());

        // 4. Create ServerDocument with callbacks
        const document = ServerDocument.make({
          schema: config.schema,
          initialState,
          initialVersion,
          maxTransactionHistory: config.maxTransactionHistory,
          onBroadcast: (message: ServerDocument.TransactionMessage) => {
            // This is called synchronously by ServerDocument
            // We need to publish to PubSub
            Effect.runSync(
              PubSub.publish(pubsub, {
                type: "transaction",
                transaction: message.transaction,
                version: message.version,
              })
            );
          },
          onRejection: (transactionId: string, reason: string) => {
            Effect.runSync(
              PubSub.publish(pubsub, {
                type: "error",
                transactionId,
                reason,
              })
            );
          },
        });

        // 5. Load and replay WAL entries
        const walEntries = yield* Effect.catchAll(
          hotStorage.getEntries(documentId, initialVersion),
          () => Effect.succeed([] as WalEntry[])
        );

        for (const entry of walEntries) {
          const result = document.submit(entry.transaction);
          if (!result.success) {
            yield* Effect.logWarning("Skipping corrupted WAL entry", {
              documentId,
              version: entry.version,
              reason: result.reason,
            });
          }
        }

        const instance: DocumentInstance<typeof config.schema> = {
          document,
          pubsub,
          lastSnapshotVersion,
          lastSnapshotTime,
          transactionsSinceSnapshot,
          lastActivityTime,
        };

        // Track metrics - determine if restored or created
        if (storedDoc) {
          yield* Metric.increment(Metrics.documentsRestored);
        } else {
          yield* Metric.increment(Metrics.documentsCreated);
        }
        yield* Metric.incrementBy(Metrics.documentsActive, 1);

        return instance;
      });

    /**
     * Get or create a document instance
     */
    const getOrCreateDocument = (
      documentId: string
    ): Effect.Effect<DocumentInstance<typeof config.schema>> =>
      Effect.gen(function* () {
        const current = yield* Ref.get(store);
        const existing = HashMap.get(current, documentId);

        if (existing._tag === "Some") {
          // Update activity time
          yield* Ref.set(existing.value.lastActivityTime, Date.now());
          return existing.value as DocumentInstance<typeof config.schema>;
        }

        // Restore document
        const instance = yield* restoreDocument(documentId);

        // Store it
        yield* Ref.update(store, (map) =>
          HashMap.set(map, documentId, instance)
        );

        return instance;
      });

    /**
     * Save a snapshot to ColdStorage and truncate WAL
     */
    const saveSnapshot = (
      documentId: string,
      instance: DocumentInstance<typeof config.schema>
    ): Effect.Effect<void> =>
      Effect.gen(function* () {
        const state = instance.document.get();
        const version = instance.document.getVersion();

        if (state === undefined) {
          return;
        }

        const storedDoc: StoredDocument = {
          state,
          version,
          schemaVersion: SCHEMA_VERSION,
          savedAt: Date.now(),
        };

        const snapshotStartTime = Date.now();

        // Save to ColdStorage
        yield* Effect.catchAll(coldStorage.save(documentId, storedDoc), (e) =>
          Effect.logError("Failed to save snapshot", { documentId, error: e })
        );

        // Track snapshot metrics
        const snapshotDuration = Date.now() - snapshotStartTime;
        yield* Metric.increment(Metrics.storageSnapshots);
        yield* Metric.update(Metrics.storageSnapshotLatency, snapshotDuration);

        // Truncate WAL
        yield* Effect.catchAll(hotStorage.truncate(documentId, version), (e) =>
          Effect.logError("Failed to truncate WAL", { documentId, error: e })
        );

        // Update tracking
        yield* Ref.set(instance.lastSnapshotVersion, version);
        yield* Ref.set(instance.lastSnapshotTime, Date.now());
        yield* Ref.set(instance.transactionsSinceSnapshot, 0);
      });

    /**
     * Check if snapshot should be triggered
     */
    const checkSnapshotTriggers = (
      documentId: string,
      instance: DocumentInstance<typeof config.schema>
    ): Effect.Effect<void> =>
      Effect.gen(function* () {
        const txCount = yield* Ref.get(instance.transactionsSinceSnapshot);
        const lastTime = yield* Ref.get(instance.lastSnapshotTime);
        const now = Date.now();

        const intervalMs = Duration.toMillis(config.snapshot.interval);
        const threshold = config.snapshot.transactionThreshold;

        // Check transaction threshold
        if (txCount >= threshold) {
          yield* saveSnapshot(documentId, instance);
          return;
        }

        // Check time interval
        if (now - lastTime >= intervalMs) {
          yield* saveSnapshot(documentId, instance);
          return;
        }
      });

    /**
     * Start background GC fiber
     */
    const startGCFiber = Effect.gen(function* () {
      const gcLoop = Effect.gen(function* () {
        const current = yield* Ref.get(store);
        const now = Date.now();
        const maxIdleMs = Duration.toMillis(config.maxIdleTime);

        for (const [documentId, instance] of current) {
          const lastActivity = yield* Ref.get(instance.lastActivityTime);
          if (now - lastActivity >= maxIdleMs) {
            // Save final snapshot before eviction
            yield* saveSnapshot(documentId, instance);

            // Remove from store
            yield* Ref.update(store, (map) => HashMap.remove(map, documentId));

            // Track eviction metrics
            yield* Metric.increment(Metrics.documentsEvicted);
            yield* Metric.incrementBy(Metrics.documentsActive, -1);

            yield* Effect.logInfo("Document evicted due to idle timeout", {
              documentId,
            });
          }
        }
      });

      // Run GC every minute
      yield* gcLoop.pipe(
        Effect.repeat(Schedule.spaced("1 minute")),
        Effect.fork
      );
    });

    // Start GC fiber
    yield* startGCFiber;

    // Cleanup on shutdown
    yield* Effect.addFinalizer(() =>
      Effect.gen(function* () {
        const current = yield* Ref.get(store);
        for (const [documentId, instance] of current) {
          yield* saveSnapshot(documentId, instance);
        }
        yield* Effect.logInfo("DocumentManager shutdown complete");
      })
    );

    return {
      submit: (documentId, transaction) =>
        Effect.gen(function* () {
          const instance = yield* getOrCreateDocument(documentId);
          const submitStartTime = Date.now();

          // Submit to ServerDocument
          const result = instance.document.submit(transaction);

          // Track latency
          const latency = Date.now() - submitStartTime;
          yield* Metric.update(Metrics.transactionsLatency, latency);

          if (result.success) {
            // Track success
            yield* Metric.increment(Metrics.transactionsProcessed);

            // Append to WAL
            const walEntry: WalEntry = {
              transaction,
              version: result.version,
              timestamp: Date.now(),
            };

            yield* Effect.catchAll(
              hotStorage.append(documentId, walEntry),
              (e) =>
                Effect.logError("Failed to append to WAL", {
                  documentId,
                  error: e,
                })
            );

            // Track WAL append
            yield* Metric.increment(Metrics.storageWalAppends);

            // Increment transaction count
            yield* Ref.update(
              instance.transactionsSinceSnapshot,
              (n) => n + 1
            );

            // Check snapshot triggers
            yield* checkSnapshotTriggers(documentId, instance);
          } else {
            // Track rejection
            yield* Metric.increment(Metrics.transactionsRejected);
          }

          return result;
        }),

      getSnapshot: (documentId) =>
        Effect.gen(function* () {
          const instance = yield* getOrCreateDocument(documentId);
          return instance.document.getSnapshot();
        }),

      subscribe: (documentId) =>
        Effect.gen(function* () {
          const instance = yield* getOrCreateDocument(documentId);
          return Stream.fromPubSub(instance.pubsub);
        }),

      touch: (documentId) =>
        Effect.gen(function* () {
          const current = yield* Ref.get(store);
          const existing = HashMap.get(current, documentId);
          if (existing._tag === "Some") {
            yield* Ref.set(existing.value.lastActivityTime, Date.now());
          }
        }),
    };
  })
);

// =============================================================================
// Re-export namespace
// =============================================================================

export const DocumentManager = {
  Tag: DocumentManagerTag,
  ConfigTag: DocumentManagerConfigTag,
  layer,
};
