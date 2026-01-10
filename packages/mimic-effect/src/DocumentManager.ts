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
  ResolvedConfig,
  StoredDocument,
  WalEntry,
} from "./Types";
import type { SnapshotMessage, ServerBroadcast } from "./Protocol";
import { ColdStorageTag } from "./ColdStorage";
import { HotStorageTag } from "./HotStorage";
import { ColdStorageError, HotStorageError } from "./Errors";
import * as Metrics from "./Metrics";

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
 * Error type for DocumentManager operations
 */
export type DocumentManagerError = ColdStorageError | HotStorageError;

/**
 * Internal service for managing document lifecycle.
 */
export interface DocumentManager {
  /**
   * Submit a transaction to a document.
   * May fail with ColdStorageError or HotStorageError if storage is unavailable.
   */
  readonly submit: (
    documentId: string,
    transaction: Transaction.Transaction
  ) => Effect.Effect<SubmitResult, DocumentManagerError>;

  /**
   * Get a snapshot of a document.
   * May fail with ColdStorageError or HotStorageError if storage is unavailable.
   */
  readonly getSnapshot: (documentId: string) => Effect.Effect<SnapshotMessage, DocumentManagerError>;

  /**
   * Subscribe to broadcasts for a document.
   * May fail with ColdStorageError or HotStorageError if storage is unavailable.
   */
  readonly subscribe: (
    documentId: string
  ) => Effect.Effect<Stream.Stream<ServerBroadcast>, DocumentManagerError, Scope.Scope>;

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
export const layer = Layer.scoped(
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
    ): Effect.Effect<DocumentInstance<typeof config.schema>, ColdStorageError | HotStorageError> =>
      Effect.gen(function* () {
        // 1. Load snapshot from ColdStorage (errors propagate - do not silently fallback)
        const storedDoc = yield* coldStorage.load(documentId);

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

        // 5. Load WAL entries (errors propagate - do not silently fallback)
        const walEntries = yield* hotStorage.getEntries(documentId, initialVersion);

        // 6. Verify WAL continuity (warning only, non-blocking)
        if (walEntries.length > 0) {
          const firstWalVersion = walEntries[0]!.version;
          const expectedFirst = initialVersion + 1;

          if (firstWalVersion !== expectedFirst) {
            yield* Effect.logWarning("WAL version gap detected", {
              documentId,
              snapshotVersion: initialVersion,
              firstWalVersion,
              expectedFirst,
            });
            yield* Metric.increment(Metrics.storageVersionGaps);
          }

          // Check internal gaps
          for (let i = 1; i < walEntries.length; i++) {
            const prev = walEntries[i - 1]!.version;
            const curr = walEntries[i]!.version;
            if (curr !== prev + 1) {
              yield* Effect.logWarning("WAL internal gap detected", {
                documentId,
                previousVersion: prev,
                currentVersion: curr,
              });
            }
          }
        }

        // 7. Replay WAL entries
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
    ): Effect.Effect<DocumentInstance<typeof config.schema>, ColdStorageError | HotStorageError> =>
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
     * Save a snapshot to ColdStorage and truncate WAL.
     * Idempotent: skips save if already snapshotted at current version.
     * Truncate failures are non-fatal and will be retried on next snapshot.
     */
    const saveSnapshot = (
      documentId: string,
      instance: DocumentInstance<typeof config.schema>
    ): Effect.Effect<void, ColdStorageError> =>
      Effect.gen(function* () {
        const version = instance.document.getVersion();
        const lastSnapshotVersion = yield* Ref.get(instance.lastSnapshotVersion);

        // Idempotency check: skip if already snapshotted at this version
        if (version <= lastSnapshotVersion) {
          return;
        }

        const state = instance.document.get();
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

        // Save to ColdStorage - let errors propagate
        yield* coldStorage.save(documentId, storedDoc);

        // Track snapshot metrics
        const snapshotDuration = Date.now() - snapshotStartTime;
        yield* Metric.increment(Metrics.storageSnapshots);
        yield* Metric.update(Metrics.storageSnapshotLatency, snapshotDuration);

        // Update tracking BEFORE truncate (for idempotency on retry)
        yield* Ref.set(instance.lastSnapshotVersion, version);
        yield* Ref.set(instance.lastSnapshotTime, Date.now());
        yield* Ref.set(instance.transactionsSinceSnapshot, 0);

        // Truncate WAL - non-fatal, will be retried on next snapshot
        yield* Effect.catchAll(hotStorage.truncate(documentId, version), (e) =>
          Effect.logWarning("WAL truncate failed - will retry on next snapshot", {
            documentId,
            version,
            error: e,
          })
        );
      });

    /**
     * Check if snapshot should be triggered
     */
    const checkSnapshotTriggers = (
      documentId: string,
      instance: DocumentInstance<typeof config.schema>
    ): Effect.Effect<void, ColdStorageError> =>
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
            // Save final snapshot before eviction (best effort)
            yield* Effect.catchAll(saveSnapshot(documentId, instance), (e) =>
              Effect.logError("Failed to save snapshot during eviction", {
                documentId,
                error: e,
              })
            );

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
          // Best effort save - don't fail shutdown if storage is unavailable
          yield* Effect.catchAll(saveSnapshot(documentId, instance), (e) =>
            Effect.logError("Failed to save snapshot during shutdown", {
              documentId,
              error: e,
            })
          );
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
            // Append to WAL - MUST succeed for transaction durability
            const walEntry: WalEntry = {
              transaction,
              version: result.version,
              timestamp: Date.now(),
            };

            const appendResult = yield* Effect.either(
              hotStorage.append(documentId, walEntry)
            );

            if (appendResult._tag === "Left") {
              // WAL append failed - transaction is NOT durable
              yield* Effect.logError("WAL append failed - rolling back transaction", {
                documentId,
                version: result.version,
                error: appendResult.left,
              });
              yield* Metric.increment(Metrics.walAppendFailures);

              // Return failure - client must retry
              return {
                success: false as const,
                reason: "Storage unavailable. Please retry.",
              };
            }

            // WAL append succeeded - transaction is durable
            yield* Metric.increment(Metrics.transactionsProcessed);
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
