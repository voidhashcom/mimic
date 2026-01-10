/**
 * @voidhash/mimic-effect - MimicServerEngine
 *
 * Core document management service for Mimic real-time collaboration.
 * Handles document lifecycle, storage, presence, and transaction processing.
 *
 * This is the engine layer - for WebSocket routes, use MimicServer.layerHttpLayerRouter().
 */
import {
  Context,
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
   * May fail with MimicServerEngineError if storage is unavailable.
   */
  readonly getSnapshot: (
    documentId: string
  ) => Effect.Effect<{ state: unknown; version: number }, MimicServerEngineError>;

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
export class MimicServerEngineTag extends Context.Tag(
  "@voidhash/mimic-effect/MimicServerEngine"
)<MimicServerEngineTag, MimicServerEngine>() {}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_MAX_IDLE_TIME = Duration.minutes(5);
const DEFAULT_MAX_TRANSACTION_HISTORY = 1000;
const DEFAULT_SNAPSHOT_INTERVAL = Duration.minutes(5);
const DEFAULT_SNAPSHOT_THRESHOLD = 100;

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
    ? Duration.decode(config.maxIdleTime)
    : DEFAULT_MAX_IDLE_TIME,
  maxTransactionHistory:
    config.maxTransactionHistory ?? DEFAULT_MAX_TRANSACTION_HISTORY,
  snapshot: {
    interval: config.snapshot?.interval
      ? Duration.decode(config.snapshot.interval)
      : DEFAULT_SNAPSHOT_INTERVAL,
    transactionThreshold:
      config.snapshot?.transactionThreshold ?? DEFAULT_SNAPSHOT_THRESHOLD,
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

  return Layer.scoped(
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
              yield* Effect.catchAll(entry.instance.saveSnapshot(), (e) =>
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
        yield* gcLoop().pipe(
          Effect.repeat(Schedule.spaced("1 minute")),
          Effect.fork
        );
      });

      // Start GC fiber
      yield* startGCFiber();

      // Cleanup on shutdown
      yield* Effect.addFinalizer(() =>
        Effect.fn("engine.shutdown")(function* () {
          const current = yield* Ref.get(store);
          for (const [documentId, entry] of current) {
            // Best effort save - don't fail shutdown if storage is unavailable
            yield* Effect.catchAll(entry.instance.saveSnapshot(), (e) =>
              Effect.logError("Failed to save snapshot during shutdown", {
                documentId,
                error: e,
              })
            );
          }
          yield* Effect.logInfo("MimicServerEngine shutdown complete");
        })()
      );

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
