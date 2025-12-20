import type { StateCreator, StoreMutatorIdentifier } from "zustand";
import type { ClientDocument } from "@voidhash/mimic/client";
import type { Primitive } from "@voidhash/mimic";

// =============================================================================
// Mimic State Types
// =============================================================================

/**
 * The mimic object containing the document and client state.
 * This is added to the zustand store by the middleware.
 */
export interface MimicObject<TSchema extends Primitive.AnyPrimitive> {
  /** The ClientDocument instance for performing transactions */
  readonly document: ClientDocument.ClientDocument<TSchema>;
  /** Read-only snapshot of the document state */
  readonly snapshot: Primitive.InferSnapshot<TSchema>;
  /** Whether the client is connected to the server */
  readonly isConnected: boolean;
  /** Whether the client is fully initialized and ready */
  readonly isReady: boolean;
  /** Number of pending transactions */
  readonly pendingCount: number;
  /** Whether there are pending changes */
  readonly hasPendingChanges: boolean;
}

/**
 * The state slice added by the mimic middleware.
 */
export interface MimicSlice<TSchema extends Primitive.AnyPrimitive> {
  /** The mimic object containing document and state */
  readonly mimic: MimicObject<TSchema>;
}

// =============================================================================
// Middleware Types
// =============================================================================

/**
 * Type for the mimic middleware mutator.
 */
export type MimicMutator<TSchema extends Primitive.AnyPrimitive> = [
  "mimic",
  TSchema
];

/**
 * Type for state creator with mimic slice merged.
 */
export type MimicStateCreator<
  TSchema extends Primitive.AnyPrimitive,
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = [],
> = StateCreator<T & MimicSlice<TSchema>, Mps, Mcs, T>;

/**
 * Options for the mimic middleware.
 */
export interface MimicMiddlewareOptions {
  /** If true, automatically subscribe when store is created (default: true) */
  readonly autoSubscribe?: boolean;
  /** If true, automatically attempt to connect the document to the remote server */
  readonly autoConnect?: boolean;
}
