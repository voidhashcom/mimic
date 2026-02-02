/**
 * @voidhash/mimic-react/zustand-commander
 *
 * Commander creation and command definition.
 *
 * @since 0.0.1
 */

import type { StoreApi } from "zustand";
import type { Primitive } from "@voidhash/mimic";
import type { ClientDocument } from "@voidhash/mimic/client";
import {
  COMMAND_SYMBOL,
  UNDOABLE_COMMAND_SYMBOL,
  isUndoableCommand,
  type Command,
  type Commander,
  type CommanderOptions,
  type CommanderSlice,
  type CommandContext,
  type CommandDispatch,
  type CommandFn,
  type RevertFn,
  type UndoableCommand,
  type UndoEntry,
} from "./types";

// =============================================================================
// Default Options
// =============================================================================

const DEFAULT_OPTIONS: Required<CommanderOptions> = {
  maxUndoStackSize: 100,
};

// =============================================================================
// Transaction Helper
// =============================================================================

/**
 * Build a transaction function that routes to draft or document.
 */
function buildTransaction<TStore extends CommanderSlice, TSchema extends Primitive.AnyPrimitive = Primitive.AnyPrimitive>(
  storeApi: StoreApi<TStore>
): (fn: (root: Primitive.InferProxy<TSchema>) => void) => void {
  return (fn) => {
    const state = storeApi.getState();
    const draft = state._commander.activeDraft;
    if (draft) {
      draft.update(fn);
    } else {
      // Access mimic.document from the store
      const mimic = (state as any).mimic;
      if (!mimic?.document) {
        throw new Error(
          "Commander: No active draft and no mimic document found on the store."
        );
      }
      mimic.document.transaction(fn);
    }
  };
}

// =============================================================================
// Commander Implementation
// =============================================================================

/**
 * Creates a commander instance bound to a specific store type.
 *
 * @example
 * ```ts
 * // Create commander for your store type
 * const commander = createCommander<StoreState>();
 *
 * // Define commands
 * const addItem = commander.action(
 *   Schema.Struct({ name: Schema.String }),
 *   (ctx, params) => {
 *     ctx.transaction(root => {
 *       // add item
 *     });
 *   }
 * );
 *
 * // Create store with middleware
 * const useStore = create(
 *   commander.middleware(
 *     mimic(document, (set, get) => ({
 *       // your state
 *     }))
 *   )
 * );
 * ```
 */
export function createCommander<TStore extends object, TSchema extends Primitive.AnyPrimitive = Primitive.AnyPrimitive>(
  options: CommanderOptions = {}
): Commander<TStore & CommanderSlice, TSchema> {
  const { maxUndoStackSize } = { ...DEFAULT_OPTIONS, ...options };

  // Track the store API once middleware is applied
  let _storeApi: StoreApi<TStore & CommanderSlice> | null = null;

  /**
   * Creates the dispatch function for use within command handlers.
   */
  const createDispatch = (): CommandDispatch<TStore & CommanderSlice, TSchema> => {
    return <TParams, TReturn>(
      command: Command<TStore & CommanderSlice, TParams, TReturn, TSchema>
    ) => {
      return (params: TParams): TReturn => {
        if (!_storeApi) {
          throw new Error(
            "Commander: Store not initialized. Make sure to use the commander middleware."
          );
        }

        // Create context for the command
        const ctx: CommandContext<TStore & CommanderSlice, TSchema> = {
          getState: () => _storeApi!.getState(),
          setState: (partial) => _storeApi!.setState(partial as any),
          dispatch: createDispatch(),
          transaction: buildTransaction<TStore & CommanderSlice, TSchema>(_storeApi!),
        };

        // Execute the command
        const result = command.fn(ctx, params);

        // Skip undo stack when a draft is active
        const hasDraft = _storeApi!.getState()._commander.activeDraft !== null;

        // If it's an undoable command and no draft is active, add to undo stack
        if (isUndoableCommand(command) && !hasDraft) {
          const entry: UndoEntry<TParams, TReturn> = {
            command,
            params,
            result,
            timestamp: Date.now(),
          };

          _storeApi.setState((state: TStore & CommanderSlice) => {
            const { undoStack, redoStack: _redoStack } = state._commander;

            // Add to undo stack, respecting max size
            const newUndoStack = [...undoStack, entry].slice(-maxUndoStackSize);

            // Clear redo stack when a new command is executed
            return {
              ...state,
              _commander: {
                ...state._commander,
                undoStack: newUndoStack,
                redoStack: [],
              },
            };
          });
        }

        return result;
      };
    };
  };

  /**
   * Create a regular command (no undo support).
   */
  function action<TParams, TReturn = void>(
    fn: CommandFn<TStore & CommanderSlice, TParams, TReturn, TSchema>
  ): Command<TStore & CommanderSlice, TParams, TReturn, TSchema> {
    return {
      [COMMAND_SYMBOL]: true,
      fn,
    };
  }

  /**
   * Create an undoable command with undo/redo support.
   */
  function undoableAction<TParams, TReturn>(
    fn: CommandFn<TStore & CommanderSlice, TParams, TReturn, TSchema>,
    revert: RevertFn<TStore & CommanderSlice, TParams, TReturn, TSchema>
  ): UndoableCommand<TStore & CommanderSlice, TParams, TReturn, TSchema> {
    return {
      [COMMAND_SYMBOL]: true,
      [UNDOABLE_COMMAND_SYMBOL]: true,
      fn,
      revert,
    };
  }

  /**
   * Zustand middleware that adds commander functionality.
   */
  const middleware = <T extends object>(
    config: (
      set: StoreApi<T & CommanderSlice>["setState"],
      get: StoreApi<T & CommanderSlice>["getState"],
      api: StoreApi<T & CommanderSlice>
    ) => T
  ) => {
    return (
      set: StoreApi<T & CommanderSlice>["setState"],
      get: StoreApi<T & CommanderSlice>["getState"],
      api: StoreApi<T & CommanderSlice>
    ): T & CommanderSlice => {
      // Store the API reference for dispatch
      _storeApi = api as unknown as StoreApi<TStore & CommanderSlice>;

      // Get user's state
      const userState = config(set, get, api);

      // Add commander slice
      return {
        ...userState,
        _commander: {
          undoStack: [],
          redoStack: [],
          activeDraft: null,
        },
      };
    };
  };

  return {
    action,
    undoableAction,
    middleware: middleware as Commander<TStore & CommanderSlice, TSchema>["middleware"],
  };
}

// =============================================================================
// Draft Helpers
// =============================================================================

/**
 * Set the active draft on the commander slice.
 * While a draft is active, transactions route through `draft.update()` and undo is disabled.
 */
export function setActiveDraft<TStore extends CommanderSlice>(
  storeApi: StoreApi<TStore>,
  draft: ClientDocument.DraftHandle<any>
): void {
  storeApi.setState((state: TStore) => ({
    ...state,
    _commander: {
      ...state._commander,
      activeDraft: draft,
    },
  }));
}

/**
 * Clear the active draft from the commander slice.
 */
export function clearActiveDraft<TStore extends CommanderSlice>(
  storeApi: StoreApi<TStore>
): void {
  storeApi.setState((state: TStore) => ({
    ...state,
    _commander: {
      ...state._commander,
      activeDraft: null,
    },
  }));
}

// =============================================================================
// Undo/Redo Functions
// =============================================================================

/**
 * Perform an undo operation on the store.
 * Returns true if an undo was performed, false if undo stack was empty or a draft is active.
 */
export function performUndo<TStore extends CommanderSlice>(
  storeApi: StoreApi<TStore>
): boolean {
  const state = storeApi.getState();
  const { undoStack, redoStack, activeDraft } = state._commander;

  // Undo is disabled while a draft is active
  if (activeDraft) {
    return false;
  }

  // Pop the last entry from undo stack
  const entry = undoStack[undoStack.length - 1];
  if (!entry) {
    return false;
  }

  const newUndoStack = undoStack.slice(0, -1);

  // Create context for the revert function
  const ctx: CommandContext<TStore> = {
    getState: () => storeApi.getState(),
    setState: (partial) => storeApi.setState(partial as any),
    dispatch: createDispatchForUndo(storeApi),
    transaction: buildTransaction(storeApi),
  };

  // Execute the revert function
  entry.command.revert(ctx, entry.params, entry.result);

  // Move entry to redo stack
  storeApi.setState((state: TStore) => ({
    ...state,
    _commander: {
      ...state._commander,
      undoStack: newUndoStack,
      redoStack: [...redoStack, entry],
    },
  }));

  return true;
}

/**
 * Perform a redo operation on the store.
 * Returns true if a redo was performed, false if redo stack was empty or a draft is active.
 */
export function performRedo<TStore extends CommanderSlice>(
  storeApi: StoreApi<TStore>
): boolean {
  const state = storeApi.getState();
  const { undoStack, redoStack, activeDraft } = state._commander;

  // Redo is disabled while a draft is active
  if (activeDraft) {
    return false;
  }

  // Pop the last entry from redo stack
  const entry = redoStack[redoStack.length - 1];
  if (!entry) {
    return false;
  }

  const newRedoStack = redoStack.slice(0, -1);

  // Create context for re-executing the command
  const ctx: CommandContext<TStore> = {
    getState: () => storeApi.getState(),
    setState: (partial) => storeApi.setState(partial as any),
    dispatch: createDispatchForUndo(storeApi),
    transaction: buildTransaction(storeApi),
  };

  // Re-execute the command
  const result = entry.command.fn(ctx, entry.params);

  // Create new entry with potentially new result
  const newEntry: UndoEntry = {
    command: entry.command,
    params: entry.params,
    result,
    timestamp: Date.now(),
  };

  // Move entry back to undo stack
  storeApi.setState((state: TStore) => ({
    ...state,
    _commander: {
      ...state._commander,
      undoStack: [...undoStack, newEntry],
      redoStack: newRedoStack,
    },
  }));

  return true;
}

/**
 * Creates a dispatch function for use during undo/redo operations.
 * This dispatch does NOT add to undo stack (to avoid infinite loops).
 */
function createDispatchForUndo<TStore>(
  storeApi: StoreApi<TStore>
): CommandDispatch<TStore> {
  return <TParams, TReturn>(command: Command<TStore, TParams, TReturn>) => {
    return (params: TParams): TReturn => {
      const ctx: CommandContext<TStore> = {
        getState: () => storeApi.getState(),
        setState: (partial) => storeApi.setState(partial as any),
        dispatch: createDispatchForUndo(storeApi),
        transaction: buildTransaction(storeApi),
      };

      // Execute without adding to undo stack
      return command.fn(ctx, params);
    };
  };
}

/**
 * Clear the undo and redo stacks.
 */
export function clearUndoHistory<TStore extends CommanderSlice>(
  storeApi: StoreApi<TStore>
): void {
  storeApi.setState((state: TStore) => ({
    ...state,
    _commander: {
      ...state._commander,
      undoStack: [],
      redoStack: [],
    },
  }));
}
