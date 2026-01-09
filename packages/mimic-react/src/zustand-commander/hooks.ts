/**
 * @voidhash/mimic-react/zustand-commander
 *
 * React hooks for zustand-commander.
 *
 * @since 0.0.1
 */

import { useCallback, useEffect, useMemo } from "react";
import { useStore, type StoreApi, type UseBoundStore } from "zustand";
import { performRedo, performUndo, clearUndoHistory } from "./commander";
import {
  isUndoableCommand,
  type Command,
  type CommandContext,
  type CommandDispatch,
  type CommanderSlice,
  type ExtractState,
} from "./types";

// =============================================================================
// useCommander Hook
// =============================================================================

/**
 * Creates a dispatch function for commands.
 * This is for use outside of React components (e.g., in command handlers).
 */
function createDispatchFromApi<TStore extends CommanderSlice>(
  storeApi: StoreApi<TStore>,
  maxUndoStackSize = 100
): CommandDispatch<TStore> {
  const dispatch: CommandDispatch<TStore> = <TParams, TReturn>(
    command: Command<TStore, TParams, TReturn>
  ) => {
    return (params: TParams): TReturn => {
      // Create context for the command
      const ctx: CommandContext<TStore> = {
        getState: () => storeApi.getState(),
        setState: (partial) => storeApi.setState(partial as Partial<TStore>),
        dispatch,
      };

      // Execute the command
      const result = command.fn(ctx, params);

      // If it's an undoable command, add to undo stack
      if (isUndoableCommand(command)) {
        storeApi.setState((state: TStore) => {
          const { undoStack } = state._commander;

          // Add to undo stack, respecting max size
          const newUndoStack = [
            ...undoStack,
            {
              command,
              params,
              result,
              timestamp: Date.now(),
            },
          ].slice(-maxUndoStackSize);

          // Clear redo stack when a new command is executed
          return {
            ...state,
            _commander: {
              undoStack: newUndoStack,
              redoStack: [],
            },
          } as TStore;
        });
      }

      return result;
    };
  };

  return dispatch;
}

/**
 * React hook to get a dispatch function for commands.
 * The dispatch function executes commands and manages undo/redo state.
 *
 * @example
 * ```tsx
 * const dispatch = useCommander(useStore);
 *
 * const handleClick = () => {
 *   dispatch(addCard)({ columnId: "col-1", title: "New Card" });
 * };
 * ```
 */
export function useCommander<TStore extends CommanderSlice>(
  store: UseBoundStore<StoreApi<TStore>>
): CommandDispatch<TStore> {
  // Get the store API
  const storeApi = useMemo(() => {
    // UseBoundStore has the StoreApi attached
    return store as unknown as StoreApi<TStore>;
  }, [store]);

  // Create a stable dispatch function
  const dispatch = useMemo(
    () => createDispatchFromApi<TStore>(storeApi),
    [storeApi]
  );

  return dispatch as CommandDispatch<TStore>;
}

// =============================================================================
// useUndoRedo Hook
// =============================================================================

/**
 * State and actions for undo/redo functionality.
 */
export interface UndoRedoState {
  /** Whether there are actions that can be undone */
  readonly canUndo: boolean;
  /** Whether there are actions that can be redone */
  readonly canRedo: boolean;
  /** Number of items in the undo stack */
  readonly undoCount: number;
  /** Number of items in the redo stack */
  readonly redoCount: number;
  /** Undo the last action */
  readonly undo: () => boolean;
  /** Redo the last undone action */
  readonly redo: () => boolean;
  /** Clear the undo/redo history */
  readonly clear: () => void;
}

/**
 * React hook for undo/redo functionality.
 * Provides state (canUndo, canRedo) and actions (undo, redo, clear).
 *
 * @example
 * ```tsx
 * const { canUndo, canRedo, undo, redo } = useUndoRedo(useStore);
 *
 * return (
 *   <>
 *     <button onClick={undo} disabled={!canUndo}>Undo</button>
 *     <button onClick={redo} disabled={!canRedo}>Redo</button>
 *   </>
 * );
 * ```
 */
export function useUndoRedo<TStore extends CommanderSlice>(
  store: UseBoundStore<StoreApi<TStore>>
): UndoRedoState {
  // Get the store API
  const storeApi = useMemo(() => {
    return store as unknown as StoreApi<TStore>;
  }, [store]);

  // Subscribe to commander state
  const commanderState = useStore(
    store,
    (state: TStore) => state._commander
  );

  const canUndo = commanderState.undoStack.length > 0;
  const canRedo = commanderState.redoStack.length > 0;
  const undoCount = commanderState.undoStack.length;
  const redoCount = commanderState.redoStack.length;

  const undo = useCallback(() => {
    return performUndo(storeApi);
  }, [storeApi]);

  const redo = useCallback(() => {
    return performRedo(storeApi);
  }, [storeApi]);

  const clear = useCallback(() => {
    clearUndoHistory(storeApi);
  }, [storeApi]);

  return {
    canUndo,
    canRedo,
    undoCount,
    redoCount,
    undo,
    redo,
    clear,
  };
}

// =============================================================================
// Keyboard Shortcut Hook
// =============================================================================

/**
 * Options for the keyboard shortcut hook.
 */
export interface UseUndoRedoKeyboardOptions {
  /** Enable Ctrl/Cmd+Z for undo (default: true) */
  readonly enableUndo?: boolean;
  /** Enable Ctrl/Cmd+Shift+Z or Ctrl+Y for redo (default: true) */
  readonly enableRedo?: boolean;
}

/**
 * React hook that adds keyboard shortcuts for undo/redo.
 * Listens for Ctrl/Cmd+Z (undo) and Ctrl/Cmd+Shift+Z or Ctrl+Y (redo).
 *
 * @example
 * ```tsx
 * // In your app component
 * useUndoRedoKeyboard(useStore);
 * ```
 */
export function useUndoRedoKeyboard<TStore extends CommanderSlice>(
  store: UseBoundStore<StoreApi<TStore>>,
  options: UseUndoRedoKeyboardOptions = {}
): void {
  const { enableUndo = true, enableRedo = true } = options;

  const storeApi = useMemo(() => {
    return store as unknown as StoreApi<TStore>;
  }, [store]);

  // Set up keyboard listener
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
      const modKey = isMac ? event.metaKey : event.ctrlKey;

      if (!modKey) return;

      // Undo: Ctrl/Cmd + Z (without Shift)
      if (enableUndo && event.key === "z" && !event.shiftKey) {
        event.preventDefault();
        performUndo(storeApi);
        return;
      }

      // Redo: Ctrl/Cmd + Shift + Z or Ctrl + Y
      if (enableRedo) {
        if ((event.key === "z" && event.shiftKey) || event.key === "y") {
          event.preventDefault();
          performRedo(storeApi);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [storeApi, enableUndo, enableRedo]);
}
