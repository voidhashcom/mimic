/**
 * @voidhash/mimic-effect - MimicServerEngine
 *
 * Core document management service for Mimic real-time collaboration.
 * Handles document lifecycle, storage, presence, and transaction processing.
 *
 * This is the engine layer - for WebSocket routes, use MimicServer.layerHttpLayerRouter().
 */
import {
  ServiceMap,
  Duration,
  Effect,
  HashMap,
  Layer,
  Metric,
  Ref,
  Schedule,
  Scope,
  Stream,
} from "effect";
import type { Primitive, Transaction } from "@voidhash/mimic";
import type {
  DocumentInfo,
  DocumentHotStorageStats,
  EngineOverview,
  MimicServerEngineConfig,
  PresenceEntry,
  PresenceEvent,
  PresenceSnapshot,
  ResolvedConfig,
} from "./Types";
import type * as Protocol from "./Protocol";
import { ColdStorageTag } from "./ColdStorage";
import { HotStorageTag } from "./HotStorage";
import { MimicAuthServiceTag } from "./MimicAuthService";
import {
  DocumentInstance,
  type SubmitResult,
  type DocumentInstance as DocumentInstanceType,
} from "./DocumentInstance";
import {
  PresenceManagerTag,
  layer as presenceManagerLayer,
} from "./PresenceManager";
import * as Metrics from "./Metrics";
import type { ColdStorageError, HotStorageError } from "./Errors";

// =============================================================================
// Types
// =============================================================================

/**
 * Error type for MimicServerEngine operations
 */
export type MimicServerEngineError = ColdStorageError | HotStorageError;

// =============================================================================
// MimicServerEngine Interface
// =============================================================================

/**
 * MimicServerEngine service interface.
 *
 * Provides document management operations for Mimic collaboration.
 * Use MimicServer.layerHttpLayerRouter() to create WebSocket routes.
 */
export interface MimicServerEngine {
  /**
   * Submit a transaction to a document.
   * Authorization is checked against the auth service.
   * May fail with MimicServerEngineError if storage is unavailable.
   */
  readonly submit: (
    documentId: string,
    transaction: Transaction.Transaction
  ) => Effect.Effect<SubmitResult, MimicServerEngineError>;

  /**
   * Get document snapshot (current state and version).
   * Returns flat state format used for storage and synchronization.
   * May fail with MimicServerEngineError if storage is unavailable.
   */
  readonly getSnapshot: (
    documentId: string
  ) => Effect.Effect<{ state: unknown; version: number }, MimicServerEngineError>;

  /**
   * Get tree-like snapshot for rendering.
   * Returns a readonly structure where trees are converted from
   * flat state to nested/hierarchical structure suitable for UI rendering.
   * May fail with MimicServerEngineError if storage is unavailable.
   */
  readonly getTreeSnapshot: (
    documentId: string
  ) => Effect.Effect<unknown, MimicServerEngineError>;

  /**
   * Subscribe to document broadcasts (transactions).
   * Returns a stream of server messages.
   * Requires a Scope for cleanup when the subscription ends.
   * May fail with MimicServerEngineError if storage is unavailable.
   */
  readonly subscribe: (
    documentId: string
  ) => Effect.Effect<Stream.Stream<Protocol.ServerMessage, never, never>, MimicServerEngineError, Scope.Scope>;

  /**
   * Touch document to prevent idle garbage collection.
   */
  readonly touch: (documentId: string) => Effect.Effect<void, never>;

  /**
   * Get presence snapshot for a document.
   */
  readonly getPresenceSnapshot: (
    documentId: string
  ) => Effect.Effect<PresenceSnapshot, never>;

  /**
   * Set presence for a connection.
   */
  readonly setPresence: (
    documentId: string,
    connectionId: string,
    entry: PresenceEntry
  ) => Effect.Effect<void, never>;

  /**
   * Remove presence for a connection.
   */
  readonly removePresence: (
    documentId: string,
    connectionId: string
  ) => Effect.Effect<void, never>;

  /**
   * Subscribe to presence events for a document.
   * Requires a Scope for cleanup when the subscription ends.
   */
  readonly subscribePresence: (
    documentId: string
  ) => Effect.Effect<Stream.Stream<PresenceEvent, never, never>, never, Scope.Scope>;

  // ===========================================================================
  // Observability
  // ===========================================================================

  /**
   * Get information about all currently open (in-memory) documents.
   * Returns version, activity times, and snapshot tracking for each document.
   */
  readonly getOpenDocuments: () => Effect.Effect<DocumentInfo[]>;

  /**
   * Get information about a specific document if it is currently open.
   * Returns undefined if the document is not loaded in memory.
   */
  readonly getDocumentInfo: (
    documentId: string
  ) => Effect.Effect<DocumentInfo | undefined>;

  /**
   * Get hot storage (WAL) statistics for a document.
   * Queries the write-ahead log for entry count and timestamps.
   */
  readonly getHotStorageStats: (
    documentId: string
  ) => Effect.Effect<DocumentHotStorageStats, MimicServerEngineError>;

  /**
   * Get a high-level overview of the engine's current state.
   * Includes active document count and per-document information.
   */
  readonly getOverview: () => Effect.Effect<EngineOverview>;

  /**
   * Resolved engine configuration.
   * Used by route layer to access schema, presence config, etc.
   */
  readonly config: ResolvedConfig<Primitive.AnyPrimitive>;
}

// =============================================================================
// Context Tag
// =============================================================================

/**
 * Context tag for MimicServerEngine
 */
export class MimicServerEngineTag extends ServiceMap.Service<MimicServerEngineTag, MimicServerEngine>()(
  "@voidhash/mimic-effect/MimicServerEngine"
) {}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_MAX_IDLE_TIME = Duration.minutes(5);
const DEFAULT_MAX_TRANSACTION_HISTORY = 1000;
const DEFAULT_SNAPSHOT_INTERVAL = Duration.minutes(5);
const DEFAULT_SNAPSHOT_THRESHOLD = 100;
const DEFAULT_SNAPSHOT_IDLE_TIMEOUT = Duration.seconds(30);

/**
 * Resolve configuration with defaults
 */
const resolveConfig = <TSchema extends Primitive.AnyPrimitive>(
  config: MimicServerEngineConfig<TSchema>
): ResolvedConfig<TSchema> => ({
  schema: config.schema,
  initial: config.initial,
  presence: config.presence,
  maxIdleTime: config.maxIdleTime
    ? Duration.fromInputUnsafe(config.maxIdleTime)
    : DEFAULT_MAX_IDLE_TIME,
  maxTransactionHistory:
    config.maxTransactionHistory ?? DEFAULT_MAX_TRANSACTION_HISTORY,
  snapshot: {
    interval: config.snapshot?.interval
      ? Duration.fromInputUnsafe(config.snapshot.interval)
      : DEFAULT_SNAPSHOT_INTERVAL,
    transactionThreshold:
      config.snapshot?.transactionThreshold ?? DEFAULT_SNAPSHOT_THRESHOLD,
    idleTimeout: config.snapshot?.idleTimeout
      ? Duration.fromInputUnsafe(config.snapshot.idleTimeout)
      : DEFAULT_SNAPSHOT_IDLE_TIMEOUT,
  },
});

// =============================================================================
// Internal Types
// =============================================================================

/**
 * Store entry for a document instance with last activity time
 */
interface StoreEntry<TSchema extends Primitive.AnyPrimitive> {
  readonly instance: DocumentInstanceType<TSchema>;
  readonly lastActivityTime: Ref.Ref<number>;
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a MimicServerEngine layer.
 *
 * This creates the core document management service. To expose it via WebSocket,
 * use MimicServer.layerHttpLayerRouter().
 *
 * @example
 * ```typescript
 * // 1. Create the engine
 * const Engine = MimicServerEngine.make({
 *   schema: DocSchema,
 *   initial: { title: "Untitled" },
 *   presence: CursorPresence,
 *   maxIdleTime: "5 minutes",
 *   snapshot: { interval: "5 minutes", transactionThreshold: 100 },
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
 * ```
 */
export const make = <TSchema extends Primitive.AnyPrimitive>(
  config: MimicServerEngineConfig<TSchema>
): Layer.Layer<
  MimicServerEngineTag,
  never,
  ColdStorageTag | HotStorageTag | MimicAuthServiceTag
> => {
  const resolvedConfig = resolveConfig(config);

  return Layer.effect(
    MimicServerEngineTag,
    Effect.gen(function* () {
      const coldStorage = yield* ColdStorageTag;
      const hotStorage = yield* HotStorageTag;
      const presenceManager = yield* PresenceManagerTag;

      // Store: documentId -> StoreEntry
      const store = yield* Ref.make(
        HashMap.empty<string, StoreEntry<TSchema>>()
      );

      /**
       * Get or create a document instance
       */
      const getOrCreateDocument = Effect.fn("engine.document.get-or-create")(
        function* (documentId: string) {
          const current = yield* Ref.get(store);
          const existing = HashMap.get(current, documentId);

          if (existing._tag === "Some") {
            // Update activity time
            yield* Ref.set(existing.value.lastActivityTime, Date.now());
            return existing.value.instance;
          }

          // Create new document instance
          const instance = yield* DocumentInstance.make(
            documentId,
            {
              schema: config.schema,
              initial: config.initial,
              maxTransactionHistory: resolvedConfig.maxTransactionHistory,
              snapshot: resolvedConfig.snapshot,
            },
            coldStorage,
            hotStorage
          );

          const lastActivityTime = yield* Ref.make(Date.now());

          // Store it
          yield* Ref.update(store, (map) =>
            HashMap.set(map, documentId, { instance, lastActivityTime })
          );

          return instance;
        }
      );

      /**
       * Start background GC fiber
       */
      const startGCFiber = Effect.fn("engine.gc.start")(function* () {
        const gcLoop = Effect.fn("engine.gc.loop")(function* () {
          const current = yield* Ref.get(store);
          const now = Date.now();
          const maxIdleMs = Duration.toMillis(resolvedConfig.maxIdleTime);

          for (const [documentId, entry] of current) {
            const lastActivity = yield* Ref.get(entry.lastActivityTime);
            if (now - lastActivity >= maxIdleMs) {
              // Save final snapshot before eviction (best effort)
              yield* Effect["catch"](entry.instance.saveSnapshot(), (e) =>
                Effect.logError("Failed to save snapshot during eviction", {
                  documentId,
                  error: e,
                })
              );

              // Remove from store
              yield* Ref.update(store, (map) => HashMap.remove(map, documentId));

              // Track eviction metrics
              yield* Metric.update(Metrics.documentsEvicted, 1);
              yield* Metric.update(Metrics.documentsActive, -1);

              yield* Effect.logInfo("Document evicted due to idle timeout", {
                documentId,
              });
            }
          }
        });

        // Run GC every minute
        yield* gcLoop().pipe(
          Effect.repeat(Schedule.spaced("1 minute")),
          Effect.forkChild
        );
      });

      // Start GC fiber
      yield* startGCFiber();

      /**
       * Start background snapshot fiber for idle documents.
       * This ensures documents with unsnapshot transactions get persisted
       * even without new transaction activity.
       */
      const startSnapshotFiber = Effect.fn("engine.snapshot.fiber.start")(function* () {
        const idleTimeoutMs = Duration.toMillis(resolvedConfig.snapshot.idleTimeout);

        // Skip if idle snapshots are disabled
        if (idleTimeoutMs <= 0) {
          return;
        }

        const snapshotLoop = Effect.fn("engine.snapshot.loop")(function* () {
          const current = yield* Ref.get(store);
          const now = Date.now();

          for (const [documentId, entry] of current) {
            // Check if document has been idle long enough
            const lastActivity = yield* Ref.get(entry.lastActivityTime);
            const idleDuration = now - lastActivity;

            if (idleDuration < idleTimeoutMs) {
              // Document not idle long enough, skip
              continue;
            }

            // Check if document has unsnapshot transactions
            const needs = yield* entry.instance.needsSnapshot();
            if (!needs) {
              continue;
            }

            // Save snapshot (with error handling)
            yield* Effect["catch"](entry.instance.saveSnapshot(), (e) =>
              Effect.logWarning("Periodic snapshot save failed", {
                documentId,
                error: e,
              })
            );

            // Track metric
            yield* Metric.update(Metrics.storageIdleSnapshots, 1);
          }
        });

        // Run snapshot check every 10 seconds
        yield* snapshotLoop().pipe(
          Effect.repeat(Schedule.spaced("10 seconds")),
          Effect.forkChild
        );
      });

      // Start snapshot fiber
      yield* startSnapshotFiber();

      // Cleanup on shutdown
      yield* Effect.addFinalizer(() =>
        Effect.fn("engine.shutdown")(function* () {
          const current = yield* Ref.get(store);
          for (const [documentId, entry] of current) {
            // Best effort save - don't fail shutdown if storage is unavailable
            yield* Effect["catch"](entry.instance.saveSnapshot(), (e) =>
              Effect.logError("Failed to save snapshot during shutdown", {
                documentId,
                error: e,
              })
            );
          }
          yield* Effect.logInfo("MimicServerEngine shutdown complete");
        })()
      );

      /**
       * Build DocumentInfo from a store entry
       */
      const buildDocumentInfo = (
        documentId: string,
        entry: StoreEntry<TSchema>
      ) =>
        Effect.gen(function* () {
          const tracking = yield* entry.instance.getSnapshotTracking;
          const lastActivityTime = yield* entry.instance.getLastActivityTime();
          return {
            documentId,
            version: entry.instance.getVersion(),
            lastActivityTime,
            ...tracking,
          } satisfies DocumentInfo;
        });

      const engine: MimicServerEngine = {
        submit: (documentId, transaction) =>
          Effect.gen(function* () {
            const instance = yield* getOrCreateDocument(documentId);
            return yield* instance.submit(transaction);
          }),

        getSnapshot: (documentId) =>
          Effect.gen(function* () {
            const instance = yield* getOrCreateDocument(documentId);
            return instance.getSnapshot();
          }),

        getTreeSnapshot: (documentId) =>
          Effect.gen(function* () {
            const instance = yield* getOrCreateDocument(documentId);
            return instance.toSnapshot();
          }),

        subscribe: (documentId) =>
          Effect.gen(function* () {
            const instance = yield* getOrCreateDocument(documentId);
            return Stream.fromPubSub(instance.pubsub) as Stream.Stream<
              Protocol.ServerMessage,
              never,
              never
            >;
          }),

        touch: (documentId) =>
          Effect.gen(function* () {
            const current = yield* Ref.get(store);
            const existing = HashMap.get(current, documentId);
            if (existing._tag === "Some") {
              yield* Ref.set(existing.value.lastActivityTime, Date.now());
            }
          }),

        getPresenceSnapshot: (documentId) =>
          presenceManager.getSnapshot(documentId),

        setPresence: (documentId, connectionId, entry) =>
          presenceManager.set(documentId, connectionId, entry),

        removePresence: (documentId, connectionId) =>
          presenceManager.remove(documentId, connectionId),

        subscribePresence: (documentId) =>
          presenceManager.subscribe(documentId),

        // =====================================================================
        // Observability
        // =====================================================================

        getOpenDocuments: () =>
          Effect.gen(function* () {
            const current = yield* Ref.get(store);
            const documents: DocumentInfo[] = [];
            for (const [documentId, entry] of current) {
              documents.push(yield* buildDocumentInfo(documentId, entry));
            }
            return documents;
          }),

        getDocumentInfo: (documentId) =>
          Effect.gen(function* () {
            const current = yield* Ref.get(store);
            const existing = HashMap.get(current, documentId);
            if (existing._tag === "None") {
              return undefined;
            }
            return yield* buildDocumentInfo(documentId, existing.value);
          }),

        getHotStorageStats: (documentId) =>
          Effect.gen(function* () {
            const entries = yield* hotStorage.getEntries(documentId, 0);
            return {
              documentId,
              walEntryCount: entries.length,
              oldestEntryTimestamp:
                entries.length > 0 ? entries[0]!.timestamp : undefined,
              newestEntryTimestamp:
                entries.length > 0
                  ? entries[entries.length - 1]!.timestamp
                  : undefined,
            } satisfies DocumentHotStorageStats;
          }),

        getOverview: () =>
          Effect.gen(function* () {
            const current = yield* Ref.get(store);
            const documents: DocumentInfo[] = [];
            for (const [documentId, entry] of current) {
              documents.push(yield* buildDocumentInfo(documentId, entry));
            }
            return {
              activeDocumentCount: documents.length,
              documents,
            } satisfies EngineOverview;
          }),

        config: resolvedConfig as ResolvedConfig<Primitive.AnyPrimitive>,
      };

      return engine;
    })
  ).pipe(Layer.provide(presenceManagerLayer));
};

// =============================================================================
// Re-export namespace
// =============================================================================

export const MimicServerEngine = {
  Tag: MimicServerEngineTag,
  make,
};

// =============================================================================
// Re-export SubmitResult type
// =============================================================================

export type { SubmitResult };
