import type { StateCreator, StoreMutatorIdentifier } from "zustand";
import type { ClientDocument } from "@voidhash/mimic/client";
import type { Primitive, Presence } from "@voidhash/mimic";
import type {
  MimicSlice,
  MimicObject,
  MimicMiddlewareOptions,
} from "./types.js";

// =============================================================================
// Middleware Implementation
// =============================================================================

type MimicMiddleware = <
  TSchema extends Primitive.AnyPrimitive,
  TPresence extends Presence.AnyPresence | undefined = undefined,
  T extends object = object,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = [],
>(
  document: ClientDocument.ClientDocument<TSchema, TPresence>,
  config: StateCreator<T & MimicSlice<TSchema, TPresence>, Mps, Mcs, T>,
  options?: MimicMiddlewareOptions
) => StateCreator<T & MimicSlice<TSchema, TPresence>, Mps, Mcs, T & MimicSlice<TSchema, TPresence>>;

type MimicMiddlewareImpl = <
  TSchema extends Primitive.AnyPrimitive,
  TPresence extends Presence.AnyPresence | undefined = undefined,
  T extends object = object,
>(
  document: ClientDocument.ClientDocument<TSchema, TPresence>,
  config: StateCreator<T & MimicSlice<TSchema, TPresence>, [], [], T>,
  options?: MimicMiddlewareOptions
) => StateCreator<T & MimicSlice<TSchema, TPresence>, [], [], T & MimicSlice<TSchema, TPresence>>;

/**
 * Creates a MimicObject from the current document state.
 */
const createMimicObject = <
  TSchema extends Primitive.AnyPrimitive,
  TPresence extends Presence.AnyPresence | undefined = undefined
>(
  document: ClientDocument.ClientDocument<TSchema, TPresence>
): MimicObject<TSchema, TPresence> => {
  const presence = document.presence
    ? {
        selfId: document.presence.selfId(),
        self: document.presence.self(),
        // Important: clone Maps to ensure zustand selectors re-render
        // when presence changes (the underlying ClientDocument mutates Maps in-place).
        others: new Map(document.presence.others()),
        all: new Map(document.presence.all()),
      }
    : undefined;

  return {
    document,
    snapshot: document.root.toSnapshot() as Primitive.InferSnapshot<TSchema>,
    presence: presence as MimicObject<TSchema, TPresence>["presence"],
    isConnected: document.isConnected(),
    isReady: document.isReady(),
    pendingCount: document.getPendingCount(),
    hasPendingChanges: document.hasPendingChanges(),
  };
};

/**
 * Implementation of the mimic middleware.
 */
const mimicImpl: MimicMiddlewareImpl = <
  TSchema extends Primitive.AnyPrimitive,
  TPresence extends Presence.AnyPresence | undefined = undefined,
  _T extends object = object
>(
  document: ClientDocument.ClientDocument<TSchema, TPresence>,
  config: any,
  options: MimicMiddlewareOptions = {}
) => {
  const { autoSubscribe = true, autoConnect = true } = options;

  return (set: any, get: any, api: any) => {
    // Create initial mimic slice
    const initialMimic = createMimicObject(document);

    // Helper to update mimic state
    const updateMimicState = () => {
      const newMimic = createMimicObject(document);
      set(
        (state: any) => ({
          ...state,
          mimic: newMimic,
        }),
        false
      );
    };

    // Subscribe to document changes
    if (autoSubscribe) {
      document.subscribe({
        onStateChange: () => {
          updateMimicState();
        },
        onConnectionChange: () => {
          updateMimicState();
        },
        onReady: () => {
          updateMimicState();
        },
      });

      // Subscribe to presence changes (if presence schema is enabled)
      document.presence?.subscribe({
        onPresenceChange: () => {
          updateMimicState();
        },
      });
    }

    if (autoConnect) {
      document.connect();
    }

    // Get user's state - pass through set/get/api directly
    // The user's set calls won't affect mimic state since we update it separately
    const userState = config(set, get, api);

    // Combine user state with mimic slice
    return {
      ...userState,
      mimic: initialMimic,
    };
  };
};

/**
 * Zustand middleware that integrates a ClientDocument.
 * 
 * Adds a `mimic` object to the store containing:
 * - `document`: The ClientDocument instance for performing transactions
 * - `snapshot`: Read-only snapshot of the document state (reactive)
 * - `presence`: Reactive presence snapshot (self + others). Undefined if presence is not enabled on the ClientDocument.
 * - `isConnected`: Connection status
 * - `isReady`: Ready status
 * - `pendingCount`: Number of pending transactions
 * - `hasPendingChanges`: Whether there are pending changes
 * 
 * @example
 * ```ts
 * import { create } from 'zustand'
 * import { mimic } from '@voidhash/mimic-react/zustand'
 * 
 * const useStore = create(
 *   mimic(clientDocument, (set, get) => ({
 *     // Your additional store state
 *   }))
 * )
 * 
 * // Read snapshot (reactive)
 * const snapshot = useStore(state => state.mimic.snapshot)
 * 
 * // Read presence (reactive, if enabled)
 * const myPresence = useStore(state => state.mimic.presence?.self)
 * const othersPresence = useStore(state => state.mimic.presence?.others)
 * 
 * // Write via document
 * store.getState().mimic.document.transaction(root => {
 *   root.name.set("New Name")
 * })
 * ```
 */
export const mimic = mimicImpl as unknown as MimicMiddleware;
