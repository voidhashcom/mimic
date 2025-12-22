/**
 * @voidhash/mimic-react/zustand-commander
 *
 * A typesafe command system for zustand + mimic that enables business logic
 * encapsulation and client-side undo/redo capabilities.
 *
 * @since 0.0.1
 *
 * @example
 * ```ts
 * import { createCommander, useCommander, useUndoRedo } from "@voidhash/mimic-react/zustand-commander";
 * import { Schema } from "effect";
 *
 * // 1. Create commander bound to your store type
 * const commander = createCommander<StoreState>();
 *
 * // 2. Define regular actions
 * const selectCard = commander.action(
 *   Schema.Struct({ cardId: Schema.String }),
 *   (ctx, params) => {
 *     ctx.setState({ selectedCardId: params.cardId });
 *   }
 * );
 *
 * // 3. Define undoable actions
 * const moveCard = commander.undoableAction(
 *   Schema.Struct({ cardId: Schema.String, toColumnId: Schema.String }),
 *   (ctx, params) => {
 *     const { mimic } = ctx.getState();
 *     const fromColumnId = // get current column
 *
 *     mimic.document.transaction(root => {
 *       // move card to new column
 *     });
 *
 *     return { fromColumnId }; // Return data needed for revert
 *   },
 *   (ctx, params, result) => {
 *     // Revert: move card back to original column
 *     ctx.dispatch(moveCard)({
 *       cardId: params.cardId,
 *       toColumnId: result.fromColumnId
 *     });
 *   }
 * );
 *
 * // 4. Create store with commander middleware
 * const useStore = create(
 *   commander.middleware(
 *     mimic(document, (set, get) => ({
 *       selectedCardId: null as string | null,
 *     }))
 *   )
 * );
 *
 * // 5. Use in components
 * function MyComponent() {
 *   const dispatch = useCommander(useStore);
 *   const { canUndo, canRedo, undo, redo } = useUndoRedo(useStore);
 *
 *   return (
 *     <>
 *       <button onClick={() => dispatch(moveCard)({ cardId: "1", toColumnId: "2" })}>
 *         Move Card
 *       </button>
 *       <button onClick={undo} disabled={!canUndo}>Undo</button>
 *       <button onClick={redo} disabled={!canRedo}>Redo</button>
 *     </>
 *   );
 * }
 * ```
 */

// =============================================================================
// Commander
// =============================================================================

export {
  createCommander,
  performUndo,
  performRedo,
  clearUndoHistory,
} from "./commander.js";

// =============================================================================
// Hooks
// =============================================================================

export {
  useCommander,
  useUndoRedo,
  useUndoRedoKeyboard,
  type UndoRedoState,
  type UseUndoRedoKeyboardOptions,
} from "./hooks.js";

// =============================================================================
// Types
// =============================================================================

export type {
  // Schema types
  AnyEffectSchema,
  InferSchemaType,
  // Command types
  Command,
  UndoableCommand,
  AnyCommand,
  AnyUndoableCommand,
  // Context & functions
  CommandContext,
  CommandFn,
  RevertFn,
  CommandDispatch,
  // Undo/Redo
  UndoEntry,
  CommanderSlice,
  // Commander
  Commander,
  CommanderOptions,
  CommanderMiddleware,
  // Helpers
  CommandParams,
  CommandReturn,
  CommandStore,
  ExtractState,
} from "./types.js";

// =============================================================================
// Symbols & Type Guards
// =============================================================================

export {
  COMMAND_SYMBOL,
  UNDOABLE_COMMAND_SYMBOL,
  isCommand,
  isUndoableCommand,
} from "./types.js";

