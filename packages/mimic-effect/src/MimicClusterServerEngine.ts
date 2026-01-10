/**
 * @voidhash/mimic-effect - MimicClusterServerEngine
 *
 * Clustered document management service using Effect Cluster for horizontal scaling.
 * Each document becomes a cluster Entity with automatic sharding, failover, and location-transparent routing.
 *
 * This is an alternative to MimicServerEngine for distributed deployments.
 */
import {
  Context,
  Duration,
  Effect,
  HashMap,
  Layer,
  Metric,
  Option,
  PubSub,
  Ref,
  Schema,
  Scope,
  Stream,
} from "effect";
import { Entity, Sharding } from "@effect/cluster";
import { Rpc } from "@effect/rpc";
import { Document, type Presence, type Primitive, type Transaction } from "@voidhash/mimic";
import { ServerDocument } from "@voidhash/mimic/server";
import type {
  MimicClusterServerEngineConfig,
  PresenceEntry,
  PresenceEvent,
  PresenceSnapshot,
  ResolvedClusterConfig,
  StoredDocument,
  WalEntry,
} from "./Types";
import type * as Protocol from "./Protocol";
import { ColdStorageTag, type ColdStorage } from "./ColdStorage";
import { HotStorageTag, type HotStorage } from "./HotStorage";
import { MimicAuthServiceTag } from "./MimicAuthService";
import { MimicServerEngineTag, type MimicServerEngine } from "./MimicServerEngine";
import type { SubmitResult } from "./DocumentManager";
import * as Metrics from "./Metrics";

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_MAX_IDLE_TIME = Duration.minutes(5);
const DEFAULT_MAX_TRANSACTION_HISTORY = 1000;
const DEFAULT_SNAPSHOT_INTERVAL = Duration.minutes(5);
const DEFAULT_SNAPSHOT_THRESHOLD = 100;
const DEFAULT_SHARD_GROUP = "mimic-documents";

// =============================================================================
// RPC Schemas
// =============================================================================

/**
 * Schema for encoded transaction (wire format)
 */
const EncodedTransactionSchema = Schema.Struct({
  id: Schema.String,
  ops: Schema.Array(Schema.Unknown),
});

/**
 * Schema for submit result
 */
const SubmitResultSchema = Schema.Union(
  Schema.Struct({
    success: Schema.Literal(true),
    version: Schema.Number,
  }),
  Schema.Struct({
    success: Schema.Literal(false),
    reason: Schema.String,
  })
);

/**
 * Schema for snapshot response
 */
const SnapshotResponseSchema = Schema.Struct({
  state: Schema.Unknown,
  version: Schema.Number,
});

/**
 * Schema for presence entry
 */
const PresenceEntrySchema = Schema.Struct({
  data: Schema.Unknown,
  userId: Schema.optional(Schema.String),
});

/**
 * Schema for presence snapshot response
 */
const PresenceSnapshotResponseSchema = Schema.Struct({
  presences: Schema.Record({ key: Schema.String, value: PresenceEntrySchema }),
});

/**
 * Schema for presence event
 */
const PresenceEventSchema = Schema.Union(
  Schema.Struct({
    type: Schema.Literal("presence_update"),
    id: Schema.String,
    data: Schema.Unknown,
    userId: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    type: Schema.Literal("presence_remove"),
    id: Schema.String,
  })
);

/**
 * Schema for server message (for broadcasts)
 */
const ServerMessageSchema = Schema.Unknown;

// =============================================================================
// Mimic Document Entity Definition
// =============================================================================

/**
 * Define the Mimic Document Entity with its RPC protocol.
 * This entity handles document operations for a single documentId.
 */
const MimicDocumentEntity = Entity.make("MimicDocument", [
  // Submit a transaction
  Rpc.make("Submit", {
    payload: { transaction: EncodedTransactionSchema },
    success: SubmitResultSchema,
  }),

  // Get document snapshot
  Rpc.make("GetSnapshot", {
    success: SnapshotResponseSchema,
  }),

  // Touch document to prevent idle GC
  Rpc.make("Touch", {
    success: Schema.Void,
  }),

  // Set presence for a connection
  Rpc.make("SetPresence", {
    payload: {
      connectionId: Schema.String,
      entry: PresenceEntrySchema,
    },
    success: Schema.Void,
  }),

  // Remove presence for a connection
  Rpc.make("RemovePresence", {
    payload: { connectionId: Schema.String },
    success: Schema.Void,
  }),

  // Get presence snapshot
  Rpc.make("GetPresenceSnapshot", {
    success: PresenceSnapshotResponseSchema,
  }),
]);

// =============================================================================
// Entity State Types
// =============================================================================

/**
 * Document state managed by the entity
 */
interface EntityDocumentState<TSchema extends Primitive.AnyPrimitive> {
  readonly document: ServerDocument.ServerDocument<TSchema>;
  readonly broadcastPubSub: PubSub.PubSub<Protocol.ServerMessage>;
  readonly presences: HashMap.HashMap<string, PresenceEntry>;
  readonly presencePubSub: PubSub.PubSub<PresenceEvent>;
  readonly lastSnapshotVersion: number;
  readonly lastSnapshotTime: number;
  readonly transactionsSinceSnapshot: number;
}

// =============================================================================
// Config Context Tag
// =============================================================================

/**
 * Context tag for cluster engine configuration
 */
class MimicClusterConfigTag extends Context.Tag(
  "@voidhash/mimic-effect/MimicClusterConfig"
)<MimicClusterConfigTag, ResolvedClusterConfig<Primitive.AnyPrimitive>>() {}

// =============================================================================
// Resolve Configuration
// =============================================================================

const resolveClusterConfig = <TSchema extends Primitive.AnyPrimitive>(
  config: MimicClusterServerEngineConfig<TSchema>
): ResolvedClusterConfig<TSchema> => ({
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
  shardGroup: config.shardGroup ?? DEFAULT_SHARD_GROUP,
});

// =============================================================================
// Helper to decode/encode transactions
// =============================================================================

/**
 * Decode an encoded transaction to a Transaction object
 */
const decodeTransaction = (
  encoded: { id: string; ops: readonly unknown[] }
): Transaction.Transaction => {
  // Import Transaction dynamically to avoid circular deps
  const { Transaction } = require("@voidhash/mimic");
  return Transaction.decode(encoded as Transaction.EncodedTransaction);
};

/**
 * Encode a Transaction to wire format
 */
const encodeTransaction = (
  tx: Transaction.Transaction
): { id: string; ops: readonly unknown[] } => {
  const { Transaction } = require("@voidhash/mimic");
  return Transaction.encode(tx);
};

// =============================================================================
// Entity Handler Factory
// =============================================================================

/**
 * Create the entity handler for MimicDocument
 */
const createEntityHandler = <TSchema extends Primitive.AnyPrimitive>(
  config: ResolvedClusterConfig<TSchema>,
  coldStorage: ColdStorage,
  hotStorage: HotStorage
) =>
  Effect.fn("cluster.entity.handler.create")(function* () {
    // Get entity address to determine documentId
    const address = yield* Entity.CurrentAddress;
    const documentId = address.entityId;

    // Current schema version (hard-coded to 1 for now)
    const SCHEMA_VERSION = 1;

    // Compute initial state
    const computeInitialState = (): Effect.Effect<
      Primitive.InferSetInput<TSchema> | undefined
    > => {
      if (config.initial === undefined) {
        return Effect.succeed(undefined);
      }

      if (typeof config.initial === "function") {
        return (
          config.initial as (ctx: {
            documentId: string;
          }) => Effect.Effect<Primitive.InferSetInput<TSchema>>
        )({ documentId });
      }

      return Effect.succeed(
        config.initial as Primitive.InferSetInput<TSchema>
      );
    };

    // Load snapshot from ColdStorage (fatal if unavailable - entity cannot start)
    const storedDoc = yield* coldStorage.load(documentId).pipe(
      Effect.orDie  // Entity cannot initialize without storage
    );

    let initialState: Primitive.InferSetInput<TSchema> | undefined;
    let initialVersion = 0;

    if (storedDoc) {
      initialState =
        storedDoc.state as Primitive.InferSetInput<TSchema>;
      initialVersion = storedDoc.version;
    } else {
      initialState = yield* computeInitialState();
    }

    // Create PubSubs for broadcasting
    const broadcastPubSub = yield* PubSub.unbounded<Protocol.ServerMessage>();
    const presencePubSub = yield* PubSub.unbounded<PresenceEvent>();

    // Create state ref
    const stateRef = yield* Ref.make<EntityDocumentState<TSchema>>({
      document: undefined as unknown as ServerDocument.ServerDocument<TSchema>,
      broadcastPubSub,
      presences: HashMap.empty(),
      presencePubSub,
      lastSnapshotVersion: initialVersion,
      lastSnapshotTime: Date.now(),
      transactionsSinceSnapshot: 0,
    });

    // Create ServerDocument with callbacks
    const document = ServerDocument.make({
      schema: config.schema,
      initialState,
      initialVersion,
      maxTransactionHistory: config.maxTransactionHistory,
      onBroadcast: (message: ServerDocument.TransactionMessage) => {
        Effect.runSync(
          PubSub.publish(broadcastPubSub, {
            type: "transaction",
            transaction: message.transaction,
            version: message.version,
          } as Protocol.ServerMessage)
        );
      },
      onRejection: (transactionId: string, reason: string) => {
        Effect.runSync(
          PubSub.publish(broadcastPubSub, {
            type: "error",
            transactionId,
            reason,
          } as Protocol.ServerMessage)
        );
      },
    });

    // Update state with document
    yield* Ref.update(stateRef, (s) => ({ ...s, document }));

    // Load WAL entries (fatal if unavailable - entity cannot start)
    const walEntries = yield* hotStorage.getEntries(documentId, initialVersion).pipe(
      Effect.orDie  // Entity cannot initialize without storage
    );

    // Verify WAL continuity (warning only, non-blocking)
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

    // Replay WAL entries
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

    // Track metrics
    if (storedDoc) {
      yield* Metric.increment(Metrics.documentsRestored);
    } else {
      yield* Metric.increment(Metrics.documentsCreated);
    }
    yield* Metric.incrementBy(Metrics.documentsActive, 1);

    /**
     * Save snapshot to ColdStorage derived from WAL entries.
     * This ensures snapshots are always based on durable WAL data.
     * Idempotent: skips save if already snapshotted at target version.
     * Truncate failures are non-fatal and will be retried on next snapshot.
     */
    const saveSnapshot = Effect.fn("cluster.document.snapshot.save")(
      function* (targetVersion: number) {
      const state = yield* Ref.get(stateRef);

      // Idempotency check: skip if already snapshotted at this version
      if (targetVersion <= state.lastSnapshotVersion) {
        return;
      }

      const snapshotStartTime = Date.now();

      // Load base snapshot from cold storage (best effort - log error but don't crash entity)
      const baseSnapshotResult = yield* Effect.either(coldStorage.load(documentId));
      if (baseSnapshotResult._tag === "Left") {
        yield* Effect.logError("Failed to load base snapshot for WAL replay", {
          documentId,
          error: baseSnapshotResult.left,
        });
        return;
      }
      const baseSnapshot = baseSnapshotResult.right;
      const baseVersion = baseSnapshot?.version ?? 0;
      const baseState = baseSnapshot?.state as Primitive.InferState<TSchema> | undefined;

      // Load WAL entries from base to target
      const walEntriesResult = yield* Effect.either(hotStorage.getEntries(documentId, baseVersion));
      if (walEntriesResult._tag === "Left") {
        yield* Effect.logError("Failed to load WAL entries for snapshot", {
          documentId,
          error: walEntriesResult.left,
        });
        return;
      }
      const walEntries = walEntriesResult.right;
      const relevantEntries = walEntries.filter(e => e.version <= targetVersion);

      if (relevantEntries.length === 0 && !baseSnapshot) {
        // Nothing to snapshot
        return;
      }

      // Rebuild state by replaying WAL on base
      let snapshotState: Primitive.InferState<TSchema> | undefined = baseState;
      for (const entry of relevantEntries) {
        // Create a temporary document to apply the transaction
        const tempDoc = Document.make(config.schema, { initialState: snapshotState });
        tempDoc.apply(entry.transaction.ops);
        snapshotState = tempDoc.get();
      }

      if (snapshotState === undefined) {
        return;
      }

      const snapshotVersion = relevantEntries.length > 0
        ? relevantEntries[relevantEntries.length - 1]!.version
        : baseVersion;

      // Re-check before saving (in case another snapshot completed while we were working)
      // This prevents a slower snapshot from overwriting a more recent one
      const currentState = yield* Ref.get(stateRef);
      if (snapshotVersion <= currentState.lastSnapshotVersion) {
        return;
      }

      const storedDocument: StoredDocument = {
        state: snapshotState,
        version: snapshotVersion,
        schemaVersion: SCHEMA_VERSION,
        savedAt: Date.now(),
      };

      // Save to ColdStorage (best effort - log error but don't crash entity)
      yield* Effect.catchAll(
        coldStorage.save(documentId, storedDocument),
        (e) =>
          Effect.logError("Failed to save snapshot", { documentId, error: e })
      );

      const snapshotDuration = Date.now() - snapshotStartTime;
      yield* Metric.increment(Metrics.storageSnapshots);
      yield* Metric.update(Metrics.storageSnapshotLatency, snapshotDuration);

      // Update tracking BEFORE truncate (for idempotency on retry)
      yield* Ref.update(stateRef, (s) => ({
        ...s,
        lastSnapshotVersion: snapshotVersion,
        lastSnapshotTime: Date.now(),
        transactionsSinceSnapshot: 0,
      }));

      // Truncate WAL - non-fatal, will be retried on next snapshot
      yield* Effect.catchAll(hotStorage.truncate(documentId, snapshotVersion), (e) =>
        Effect.logWarning("WAL truncate failed - will retry on next snapshot", {
          documentId,
          version: snapshotVersion,
          error: e,
        })
      );
      }
    );

    /**
     * Check if snapshot should be triggered
     */
    const checkSnapshotTriggers = Effect.fn(
      "cluster.document.snapshot.check-triggers"
    )(function* () {
      const state = yield* Ref.get(stateRef);
      const now = Date.now();
      const currentVersion = state.document.getVersion();

      const intervalMs = Duration.toMillis(config.snapshot.interval);
      const threshold = config.snapshot.transactionThreshold;

      if (state.transactionsSinceSnapshot >= threshold) {
        yield* saveSnapshot(currentVersion);
        return;
      }

      if (now - state.lastSnapshotTime >= intervalMs) {
        yield* saveSnapshot(currentVersion);
        return;
      }
    });

    // Cleanup on entity finalization
    yield* Effect.addFinalizer(() =>
      Effect.fn("cluster.entity.finalize")(function* () {
        // Save final snapshot before entity is garbage collected
        const state = yield* Ref.get(stateRef);
        const currentVersion = state.document.getVersion();
        yield* saveSnapshot(currentVersion);
        yield* Metric.incrementBy(Metrics.documentsActive, -1);
        yield* Metric.increment(Metrics.documentsEvicted);
        yield* Effect.logDebug("Entity finalized", { documentId });
      })()
    );

    // Return RPC handlers
    return {
      Submit: Effect.fn("cluster.document.transaction.submit")(function* ({
        payload,
      }) {
        const submitStartTime = Date.now();
        const state = yield* Ref.get(stateRef);

        // Decode transaction
        const transaction = decodeTransaction(payload.transaction);

        // Phase 1: Validate (no side effects)
        const validation = state.document.validate(transaction);

        if (!validation.valid) {
          // Track rejection
          yield* Metric.increment(Metrics.transactionsRejected);
          const latency = Date.now() - submitStartTime;
          yield* Metric.update(Metrics.transactionsLatency, latency);

          return {
            success: false as const,
            reason: validation.reason,
          };
        }

        // Phase 2: Append to WAL with gap check (BEFORE state mutation)
        const walEntry: WalEntry = {
          transaction,
          version: validation.nextVersion,
          timestamp: Date.now(),
        };

        const appendResult = yield* Effect.either(
          hotStorage.appendWithCheck(documentId, walEntry, validation.nextVersion)
        );

        if (appendResult._tag === "Left") {
          // WAL append failed - do NOT apply, state unchanged
          yield* Effect.logError("WAL append failed", {
            documentId,
            version: validation.nextVersion,
            error: appendResult.left,
          });
          yield* Metric.increment(Metrics.walAppendFailures);

          const latency = Date.now() - submitStartTime;
          yield* Metric.update(Metrics.transactionsLatency, latency);

          // Return failure - client must retry
          return {
            success: false as const,
            reason: "Storage unavailable. Please retry.",
          };
        }

        // Phase 3: Apply (state mutation + broadcast)
        state.document.apply(transaction);

        // Track metrics
        const latency = Date.now() - submitStartTime;
        yield* Metric.update(Metrics.transactionsLatency, latency);
        yield* Metric.increment(Metrics.transactionsProcessed);
        yield* Metric.increment(Metrics.storageWalAppends);

        // Increment transaction count
        yield* Ref.update(stateRef, (s) => ({
          ...s,
          transactionsSinceSnapshot: s.transactionsSinceSnapshot + 1,
        }));

        // Check snapshot triggers
        yield* checkSnapshotTriggers();

        return {
          success: true as const,
          version: validation.nextVersion,
        };
      }),

      GetSnapshot: Effect.fn("cluster.document.snapshot.get")(function* () {
        const state = yield* Ref.get(stateRef);
        return state.document.getSnapshot();
      }),

      Touch: Effect.fn("cluster.document.touch")(function* () {
        // Entity touch is handled automatically by the cluster framework
        // Just update last activity time conceptually
        return void 0;
      }),

      SetPresence: Effect.fn("cluster.presence.set")(function* ({ payload }) {
        const { connectionId, entry } = payload;

        yield* Ref.update(stateRef, (s) => ({
          ...s,
          presences: HashMap.set(s.presences, connectionId, entry),
        }));

        yield* Metric.increment(Metrics.presenceUpdates);
        yield* Metric.incrementBy(Metrics.presenceActive, 1);

        const state = yield* Ref.get(stateRef);
        const event: PresenceEvent = {
          type: "presence_update",
          id: connectionId,
          data: entry.data,
          userId: entry.userId,
        };
        yield* PubSub.publish(state.presencePubSub, event);
      }),

      RemovePresence: Effect.fn("cluster.presence.remove")(function* ({
        payload,
      }) {
        const { connectionId } = payload;
        const state = yield* Ref.get(stateRef);

        if (!HashMap.has(state.presences, connectionId)) {
          return;
        }

        yield* Ref.update(stateRef, (s) => ({
          ...s,
          presences: HashMap.remove(s.presences, connectionId),
        }));

        yield* Metric.incrementBy(Metrics.presenceActive, -1);

        const event: PresenceEvent = {
          type: "presence_remove",
          id: connectionId,
        };
        yield* PubSub.publish(state.presencePubSub, event);
      }),

      GetPresenceSnapshot: Effect.fn("cluster.presence.snapshot.get")(
        function* () {
          const state = yield* Ref.get(stateRef);
          const presences: Record<string, PresenceEntry> = {};
          for (const [id, entry] of state.presences) {
            presences[id] = entry;
          }
          return { presences };
        }
      ),
    };
  })();

// =============================================================================
// Subscription Store (for managing subscriptions at the gateway level)
// =============================================================================

/**
 * Store for managing document subscriptions
 * This is needed because cluster entities don't support streaming directly
 */
interface SubscriptionStore {
  readonly getOrCreatePubSub: (
    documentId: string
  ) => Effect.Effect<PubSub.PubSub<Protocol.ServerMessage>>;
  readonly getOrCreatePresencePubSub: (
    documentId: string
  ) => Effect.Effect<PubSub.PubSub<PresenceEvent>>;
}

class SubscriptionStoreTag extends Context.Tag(
  "@voidhash/mimic-effect/SubscriptionStore"
)<SubscriptionStoreTag, SubscriptionStore>() {}

const subscriptionStoreLayer = Layer.effect(
  SubscriptionStoreTag,
  Effect.fn("cluster.subscriptions.layer.create")(function* () {
    const documentPubSubs = yield* Ref.make(
      HashMap.empty<string, PubSub.PubSub<Protocol.ServerMessage>>()
    );
    const presencePubSubs = yield* Ref.make(
      HashMap.empty<string, PubSub.PubSub<PresenceEvent>>()
    );

    return {
      getOrCreatePubSub: Effect.fn(
        "cluster.subscriptions.pubsub.get-or-create"
      )(function* (documentId: string) {
        const current = yield* Ref.get(documentPubSubs);
        const existing = HashMap.get(current, documentId);
        if (existing._tag === "Some") {
          return existing.value;
        }

        const pubsub = yield* PubSub.unbounded<Protocol.ServerMessage>();
        yield* Ref.update(documentPubSubs, (map) =>
          HashMap.set(map, documentId, pubsub)
        );
        return pubsub;
      }),

      getOrCreatePresencePubSub: Effect.fn(
        "cluster.subscriptions.presence-pubsub.get-or-create"
      )(function* (documentId: string) {
        const current = yield* Ref.get(presencePubSubs);
        const existing = HashMap.get(current, documentId);
        if (existing._tag === "Some") {
          return existing.value;
        }

        const pubsub = yield* PubSub.unbounded<PresenceEvent>();
        yield* Ref.update(presencePubSubs, (map) =>
          HashMap.set(map, documentId, pubsub)
        );
        return pubsub;
      }),
    };
  })()
);

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a MimicClusterServerEngine layer.
 *
 * This creates a clustered document management service using Effect Cluster.
 * Each document becomes a cluster Entity with automatic sharding and failover.
 *
 * @example
 * ```typescript
 * // 1. Create the engine
 * const Engine = MimicClusterServerEngine.make({
 *   schema: DocSchema,
 *   initial: { title: "Untitled" },
 *   presence: CursorPresence,
 *   maxIdleTime: "5 minutes",
 *   snapshot: { interval: "5 minutes", transactionThreshold: 100 },
 *   shardGroup: "documents",
 * })
 *
 * // 2. Create the WebSocket route
 * const MimicRoute = MimicServer.layerHttpLayerRouter({
 *   path: "/mimic",
 * })
 *
 * // 3. Wire together with cluster infrastructure
 * const MimicLive = MimicRoute.pipe(
 *   Layer.provide(Engine),
 *   Layer.provide(ColdStorage.S3.make(...)),
 *   Layer.provide(HotStorage.Redis.make(...)),
 *   Layer.provide(MimicAuthService.make(...)),
 *   Layer.provide(ClusterInfrastructure),
 * )
 * ```
 */
export const make = <TSchema extends Primitive.AnyPrimitive>(
  config: MimicClusterServerEngineConfig<TSchema>
): Layer.Layer<
  MimicServerEngineTag,
  never,
  ColdStorageTag | HotStorageTag | MimicAuthServiceTag | Sharding.Sharding
> => {
  const resolvedConfig = resolveClusterConfig(config);

  // Create config layer
  const configLayer = Layer.succeed(
    MimicClusterConfigTag,
    resolvedConfig as ResolvedClusterConfig<Primitive.AnyPrimitive>
  );

  // Create entity layer that registers with sharding
  const entityLayer = MimicDocumentEntity.toLayer(
    Effect.gen(function* () {
      const clusterConfig = yield* MimicClusterConfigTag;
      const coldStorage = yield* ColdStorageTag;
      const hotStorage = yield* HotStorageTag;

      return yield* createEntityHandler(
        clusterConfig as ResolvedClusterConfig<TSchema>,
        coldStorage,
        hotStorage
      );
    }),
    {
      maxIdleTime: resolvedConfig.maxIdleTime,
      concurrency: 1, // Sequential message processing per document
      mailboxCapacity: 4096,
    }
  );

  // Create the engine service
  const engineLayer = Layer.scoped(
    MimicServerEngineTag,
    Effect.gen(function* () {
      // Get entity client maker
      const makeClient = yield* MimicDocumentEntity.client;

      // Get subscription store
      const subscriptionStore = yield* SubscriptionStoreTag;

      const engine: MimicServerEngine = {
        submit: (documentId, transaction) =>
          Effect.gen(function* () {
            const client = makeClient(documentId);
            const encodedTx = encodeTransaction(transaction);
            const result = yield* client.Submit({
              transaction: encodedTx as { id: string; ops: unknown[] },
            }).pipe(
              Effect.catchAll((error) =>
                Effect.succeed({
                  success: false as const,
                  reason: `Cluster error: ${String(error)}`,
                })
              )
            );

            // Broadcast to local subscribers if success
            if (result.success) {
              const pubsub =
                yield* subscriptionStore.getOrCreatePubSub(documentId);
              yield* PubSub.publish(pubsub, {
                type: "transaction",
                transaction,
                version: result.version,
              } as Protocol.ServerMessage);
            }

            return result;
          }),

        getSnapshot: (documentId) =>
          Effect.gen(function* () {
            const client = makeClient(documentId);
            return yield* client.GetSnapshot(undefined as void).pipe(Effect.orDie);
          }),

        subscribe: (documentId) =>
          Effect.gen(function* () {
            const pubsub =
              yield* subscriptionStore.getOrCreatePubSub(documentId);
            return Stream.fromPubSub(pubsub);
          }),

        touch: (documentId) =>
          Effect.gen(function* () {
            const client = makeClient(documentId);
            yield* client.Touch(undefined as void).pipe(Effect.orDie);
          }),

        getPresenceSnapshot: (documentId) =>
          Effect.gen(function* () {
            const client = makeClient(documentId);
            return yield* client.GetPresenceSnapshot(undefined as void).pipe(Effect.orDie);
          }),

        setPresence: (documentId, connectionId, entry) =>
          Effect.gen(function* () {
            const client = makeClient(documentId);
            yield* client.SetPresence({ connectionId, entry }).pipe(Effect.orDie);

            // Broadcast to local presence subscribers
            const pubsub =
              yield* subscriptionStore.getOrCreatePresencePubSub(documentId);
            yield* PubSub.publish(pubsub, {
              type: "presence_update",
              id: connectionId,
              data: entry.data,
              userId: entry.userId,
            });
          }),

        removePresence: (documentId, connectionId) =>
          Effect.gen(function* () {
            const client = makeClient(documentId);
            yield* client.RemovePresence({ connectionId }).pipe(Effect.orDie);

            // Broadcast to local presence subscribers
            const pubsub =
              yield* subscriptionStore.getOrCreatePresencePubSub(documentId);
            yield* PubSub.publish(pubsub, {
              type: "presence_remove",
              id: connectionId,
            });
          }),

        subscribePresence: (documentId) =>
          Effect.gen(function* () {
            const pubsub =
              yield* subscriptionStore.getOrCreatePresencePubSub(documentId);
            return Stream.fromPubSub(pubsub);
          }),

        config: resolvedConfig as ResolvedClusterConfig<Primitive.AnyPrimitive>,
      };

      return engine;
    })
  );

  // Compose all layers
  return Layer.mergeAll(entityLayer, engineLayer).pipe(
    Layer.provideMerge(subscriptionStoreLayer),
    Layer.provideMerge(configLayer)
  );
};

// =============================================================================
// Re-export namespace
// =============================================================================

export const MimicClusterServerEngine = {
  make,
};
