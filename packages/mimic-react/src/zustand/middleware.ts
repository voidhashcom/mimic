import type { StateCreator, StoreMutatorIdentifier } from "zustand";
import type { ClientDocument } from "@voidhash/mimic/client";
import type { Primitive } from "@voidhash/mimic";
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
  T extends object,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = [],
>(
  document: ClientDocument.ClientDocument<TSchema>,
  config: StateCreator<T & MimicSlice<TSchema>, Mps, Mcs, T>,
  options?: MimicMiddlewareOptions
) => StateCreator<T & MimicSlice<TSchema>, Mps, Mcs, T & MimicSlice<TSchema>>;

type MimicMiddlewareImpl = <
  TSchema extends Primitive.AnyPrimitive,
  T extends object,
>(
  document: ClientDocument.ClientDocument<TSchema>,
  config: StateCreator<T & MimicSlice<TSchema>, [], [], T>,
  options?: MimicMiddlewareOptions
) => StateCreator<T & MimicSlice<TSchema>, [], [], T & MimicSlice<TSchema>>;

/**
 * Creates a MimicObject from the current document state.
 */
const createMimicObject = <TSchema extends Primitive.AnyPrimitive>(
  document: ClientDocument.ClientDocument<TSchema>
): MimicObject<TSchema> => {
  return {
    document,
    snapshot: document.root.toSnapshot() as Primitive.InferSnapshot<TSchema>,
    isConnected: document.isConnected(),
    isReady: document.isReady(),
    pendingCount: document.getPendingCount(),
    hasPendingChanges: document.hasPendingChanges(),
  };
};

/**
 * Implementation of the mimic middleware.
 */
const mimicImpl: MimicMiddlewareImpl = (document, config, options = {}) => {
  const { autoSubscribe = true, autoConnect = true } = options;

  return (set, get, api) => {
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
    }

    if (autoConnect) {
      document.connect();
    }

    // Get user's state - pass through set/get/api directly
    // The user's set calls won't affect mimic state since we update it separately
    const userState = config(set as any, get, api);

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
 * // Write via document
 * store.getState().mimic.document.transaction(root => {
 *   root.name.set("New Name")
 * })
 * ```
 */
export const mimic = mimicImpl as unknown as MimicMiddleware;
