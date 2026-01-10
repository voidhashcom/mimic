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
  PubSub,
  Ref,
  Schema,
  Stream,
} from "effect";
import { Entity, Sharding } from "@effect/cluster";
import { Rpc } from "@effect/rpc";
import { type Primitive, type Transaction } from "@voidhash/mimic";
import type {
  MimicClusterServerEngineConfig,
  PresenceEntry,
  PresenceEvent,
  ResolvedClusterConfig,
} from "./Types";
import type * as Protocol from "./Protocol";
import { ColdStorageTag, type ColdStorage } from "./ColdStorage";
import { HotStorageTag, type HotStorage } from "./HotStorage";
import { MimicAuthServiceTag } from "./MimicAuthService";
import { MimicServerEngineTag, type MimicServerEngine } from "./MimicServerEngine";
import {
  DocumentInstance,
  type DocumentInstance as DocumentInstanceInterface,
} from "./DocumentInstance";
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
 * Entity state that wraps DocumentInstance and adds presence management
 */
interface EntityState<TSchema extends Primitive.AnyPrimitive> {
  readonly instance: DocumentInstanceInterface<TSchema>;
  readonly presences: HashMap.HashMap<string, PresenceEntry>;
  readonly presencePubSub: PubSub.PubSub<PresenceEvent>;
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

    // Create DocumentInstance (fatal if unavailable - entity cannot start)
    const instance = yield* DocumentInstance.make(
      documentId,
      {
        schema: config.schema,
        initial: config.initial,
        maxTransactionHistory: config.maxTransactionHistory,
        snapshot: config.snapshot,
      },
      coldStorage,
      hotStorage
    ).pipe(Effect.orDie);

    // Create presence PubSub and state ref
    const presencePubSub = yield* PubSub.unbounded<PresenceEvent>();
    const stateRef = yield* Ref.make<EntityState<TSchema>>({
      instance,
      presences: HashMap.empty(),
      presencePubSub,
    });

    // Cleanup on entity finalization
    yield* Effect.addFinalizer(() =>
      Effect.fn("cluster.entity.finalize")(function* () {
        // Best effort save - don't fail shutdown if storage is unavailable
        yield* Effect.catchAll(instance.saveSnapshot(), (e) =>
          Effect.logError("Failed to save snapshot during entity finalization", {
            documentId,
            error: e,
          })
        );
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
        // Decode transaction
        const transaction = decodeTransaction(payload.transaction);

        // Use DocumentInstance's submit method, catching storage errors
        return yield* instance.submit(transaction).pipe(
          Effect.catchAll((error) =>
            Effect.succeed({
              success: false as const,
              reason: `Storage error: ${String(error)}`,
            })
          )
        );
      }),

      GetSnapshot: Effect.fn("cluster.document.snapshot.get")(function* () {
        return instance.getSnapshot();
      }),

      Touch: Effect.fn("cluster.document.touch")(function* () {
        yield* instance.touch();
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
