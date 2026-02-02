import type { StateCreator, StoreMutatorIdentifier } from "zustand";
import type { ClientDocument } from "@voidhash/mimic/client";
import type { Primitive, Presence } from "@voidhash/mimic";

// =============================================================================
// Mimic State Types
// =============================================================================

/**
 * Presence data exposed on the zustand store (reactive snapshot).
 */
export interface MimicPresence<TPresence extends Presence.AnyPresence> {
  /**
   * This client's connection ID (set after receiving presence snapshot).
   * Undefined before the snapshot is received.
   */
  readonly selfId: string | undefined;

  /**
   * This client's current presence data.
   * Undefined if not set.
   */
  readonly self: Presence.Infer<TPresence> | undefined;

  /**
   * Other clients' presence entries (connectionId -> entry).
   */
  readonly others: ReadonlyMap<
    string,
    Presence.PresenceEntry<Presence.Infer<TPresence>>
  >;

  /**
   * All presence entries including self (connectionId -> entry).
   */
  readonly all: ReadonlyMap<
    string,
    Presence.PresenceEntry<Presence.Infer<TPresence>>
  >;
}

/**
 * The mimic object containing the document and client state.
 * This is added to the zustand store by the middleware.
 */
export interface MimicObject<
  TSchema extends Primitive.AnyPrimitive,
  TPresence extends Presence.AnyPresence | undefined = undefined
> {
  /** The ClientDocument instance for performing transactions */
  readonly document: ClientDocument.ClientDocument<TSchema, TPresence>;
  /** Read-only snapshot of the document state */
  readonly snapshot: Primitive.InferSnapshot<TSchema>;
  /**
   * Reactive presence snapshot (self + others).
   * Undefined when the ClientDocument was created without a presence schema.
   */
  readonly presence: TPresence extends Presence.AnyPresence
    ? MimicPresence<TPresence>
    : undefined;
  /** Whether the client is connected to the server */
  readonly isConnected: boolean;
  /** Whether the client is fully initialized and ready */
  readonly isReady: boolean;
  /** Number of pending transactions */
  readonly pendingCount: number;
  /** Whether there are pending changes */
  readonly hasPendingChanges: boolean;
  /** Set of active draft IDs */
  readonly activeDraftIds: ReadonlySet<string>;
}

/**
 * The state slice added by the mimic middleware.
 */
export interface MimicSlice<
  TSchema extends Primitive.AnyPrimitive,
  TPresence extends Presence.AnyPresence | undefined = undefined
> {
  /** The mimic object containing document and state */
  readonly mimic: MimicObject<TSchema, TPresence>;
}

// =============================================================================
// Middleware Types
// =============================================================================

/**
 * Type for the mimic middleware mutator.
 */
export type MimicMutator<
  TSchema extends Primitive.AnyPrimitive,
  TPresence extends Presence.AnyPresence | undefined = undefined
> = [
  "mimic",
  TSchema,
  TPresence
];

/**
 * Type for state creator with mimic slice merged.
 */
export type MimicStateCreator<
  TSchema extends Primitive.AnyPrimitive,
  TPresence extends Presence.AnyPresence | undefined,
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = [],
> = StateCreator<T & MimicSlice<TSchema, TPresence>, Mps, Mcs, T>;

/**
 * Options for the mimic middleware.
 */
export interface MimicMiddlewareOptions {
  /** If true, automatically subscribe when store is created (default: true) */
  readonly autoSubscribe?: boolean;
  /** If true, automatically attempt to connect the document to the remote server */
  readonly autoConnect?: boolean;
}
