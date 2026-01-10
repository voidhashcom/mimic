/**
 * @voidhash/mimic-effect - Common Types
 *
 * Shared types used throughout the mimic-effect package.
 */
import type { Duration, Effect } from "effect";
import type { Presence, Primitive, Transaction } from "@voidhash/mimic";

// =============================================================================
// Permission Types
// =============================================================================

/**
 * Permission level for document access
 * - "read": Can subscribe, receive transactions, get snapshots
 * - "write": All of the above, plus can submit transactions and set presence
 */
export type Permission = "read" | "write";

/**
 * Authentication context returned after successful authentication
 */
export interface AuthContext {
  readonly userId: string;
  readonly permission: Permission;
  readonly metadata?: Record<string, unknown>;
}

// =============================================================================
// Storage Types
// =============================================================================

/**
 * Document state stored in ColdStorage (snapshots)
 */
export interface StoredDocument {
  /** Document state */
  readonly state: unknown;
  /** Current version number */
  readonly version: number;
  /** Schema version for future migration support */
  readonly schemaVersion: number;
  /** Unix timestamp (ms) when saved */
  readonly savedAt: number;
}

/**
 * WAL entry stored in HotStorage
 */
export interface WalEntry {
  /** The transaction data */
  readonly transaction: Transaction.Transaction;
  /** Version after this transaction */
  readonly version: number;
  /** Unix timestamp (ms) */
  readonly timestamp: number;
}

// =============================================================================
// Presence Types
// =============================================================================

/**
 * Presence entry for a connection
 */
export interface PresenceEntry {
  /** Presence data (schema-validated) */
  readonly data: unknown;
  /** User ID from authentication (optional) */
  readonly userId?: string;
}

/**
 * Snapshot of all presences for a document
 */
export interface PresenceSnapshot {
  readonly presences: Record<string, PresenceEntry>;
}

/**
 * Presence update event
 */
export interface PresenceUpdateEvent {
  readonly type: "presence_update";
  readonly id: string;
  readonly data: unknown;
  readonly userId?: string;
}

/**
 * Presence remove event
 */
export interface PresenceRemoveEvent {
  readonly type: "presence_remove";
  readonly id: string;
}

/**
 * Union of presence events
 */
export type PresenceEvent = PresenceUpdateEvent | PresenceRemoveEvent;

// =============================================================================
// Config Types
// =============================================================================

/**
 * Duration input type - matches Effect's DurationInput
 */
export type DurationInput = Duration.DurationInput;

/**
 * Snapshot configuration
 */
export interface SnapshotConfig {
  /** Time-based snapshot interval */
  readonly interval?: DurationInput;
  /** Transaction count threshold for snapshots */
  readonly transactionThreshold?: number;
  /**
   * Trigger snapshot when document is idle (no transactions) for this duration.
   * Set to 0 to disable idle snapshots.
   * Default: 30 seconds
   */
  readonly idleTimeout?: DurationInput;
}

/**
 * Context passed to initial state function
 */
export interface InitialContext {
  readonly documentId: string;
}

/**
 * Initial state function type
 */
export type InitialFn<TSchema extends Primitive.AnyPrimitive> = (
  context: InitialContext
) => Effect.Effect<Primitive.InferSetInput<TSchema>>;

/**
 * Initial state - either a static value or a function
 */
export type Initial<TSchema extends Primitive.AnyPrimitive> =
  | Primitive.InferSetInput<TSchema>
  | InitialFn<TSchema>;

/**
 * MimicServerEngine configuration
 */
export interface MimicServerEngineConfig<
  TSchema extends Primitive.AnyPrimitive,
> {
  /** Document schema (required) */
  readonly schema: TSchema;

  /** Initial state for new documents (optional) */
  readonly initial?: Initial<TSchema>;

  /** Presence schema (optional) */
  readonly presence?: Presence.AnyPresence;

  /** Document idle timeout before GC (default: 5 minutes) */
  readonly maxIdleTime?: DurationInput;

  /** Maximum transaction history for deduplication (default: 1000) */
  readonly maxTransactionHistory?: number;

  /** Snapshot configuration */
  readonly snapshot?: SnapshotConfig;
}

/**
 * MimicClusterServerEngine configuration (extends MimicServerEngineConfig)
 */
export interface MimicClusterServerEngineConfig<
  TSchema extends Primitive.AnyPrimitive,
> extends MimicServerEngineConfig<TSchema> {
  /** Shard group name for cluster distribution (default: "mimic-documents") */
  readonly shardGroup?: string;
}

// =============================================================================
// Route Config Types
// =============================================================================

/**
 * MimicServer route configuration
 */
export interface MimicServerRouteConfig {
  /** WebSocket route path prefix (default: "/mimic") */
  readonly path?: `/${string}`;

  /** Heartbeat ping interval (default: 30 seconds) */
  readonly heartbeatInterval?: DurationInput;

  /** Heartbeat timeout - disconnect if no activity (default: 10 seconds) */
  readonly heartbeatTimeout?: DurationInput;
}

// =============================================================================
// Internal Config with Defaults Applied
// =============================================================================

/**
 * Resolved engine configuration with all defaults applied
 */
export interface ResolvedConfig<TSchema extends Primitive.AnyPrimitive> {
  readonly schema: TSchema;
  readonly initial: Initial<TSchema> | undefined;
  readonly presence: Presence.AnyPresence | undefined;
  readonly maxIdleTime: Duration.Duration;
  readonly maxTransactionHistory: number;
  readonly snapshot: {
    readonly interval: Duration.Duration;
    readonly transactionThreshold: number;
    readonly idleTimeout: Duration.Duration;
  };
}

/**
 * Resolved route configuration with all defaults applied
 */
export interface ResolvedRouteConfig {
  readonly path: string;
  readonly heartbeatInterval: Duration.Duration;
  readonly heartbeatTimeout: Duration.Duration;
}

/**
 * Resolved cluster engine configuration with all defaults applied
 */
export interface ResolvedClusterConfig<TSchema extends Primitive.AnyPrimitive>
  extends ResolvedConfig<TSchema> {
  /** Shard group name for cluster distribution */
  readonly shardGroup: string;
}
