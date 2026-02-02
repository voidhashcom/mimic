/**
 * @voidhash/mimic-react/zustand-commander
 *
 * Type definitions for the zustand-commander package.
 *
 * @since 0.0.1
 */

import type { StoreApi, UseBoundStore } from "zustand";
import type { Primitive } from "@voidhash/mimic";
import type { ClientDocument } from "@voidhash/mimic/client";

// =============================================================================
// Command Symbol & Type Guard
// =============================================================================

/**
 * Symbol used to identify Command objects at runtime.
 */
export const COMMAND_SYMBOL = Symbol.for("zustand-commander/command");

/**
 * Symbol used to identify UndoableCommand objects at runtime.
 */
export const UNDOABLE_COMMAND_SYMBOL = Symbol.for(
  "zustand-commander/undoable-command"
);

// =============================================================================
// Command Context
// =============================================================================

/**
 * Context provided to command functions.
 * Gives access to store state and dispatch capabilities.
 */
export interface CommandContext<TStore, TSchema extends Primitive.AnyPrimitive = Primitive.AnyPrimitive> {
  /**
   * Get the current store state.
   */
  readonly getState: () => TStore;

  /**
   * Set partial store state (for local/browser state updates).
   */
  readonly setState: (partial: Partial<TStore>) => void;

  /**
   * Dispatch another command.
   * Returns the result of the dispatched command.
   *
   * @example
   * dispatch(otherCommand)({ param: "value" });
   */
  readonly dispatch: CommandDispatch<TStore, TSchema>;

  /**
   * Run a transaction on the document.
   * Routes to the active draft if one is linked, otherwise to the document directly.
   */
  readonly transaction: (fn: (root: Primitive.InferProxy<TSchema>) => void) => void;
}

// =============================================================================
// Command Function Types
// =============================================================================

/**
 * The function signature for a command handler.
 */
export type CommandFn<TStore, TParams, TReturn, TSchema extends Primitive.AnyPrimitive = Primitive.AnyPrimitive> = (
  ctx: CommandContext<TStore, TSchema>,
  params: TParams
) => TReturn;

/**
 * The function signature for an undoable command's revert handler.
 * Receives the original params and the result from the forward execution.
 */
export type RevertFn<TStore, TParams, TReturn, TSchema extends Primitive.AnyPrimitive = Primitive.AnyPrimitive> = (
  ctx: CommandContext<TStore, TSchema>,
  params: TParams,
  result: TReturn
) => void;

// =============================================================================
// Command Types
// =============================================================================

/**
 * A command that can be dispatched to modify store state.
 * Regular commands do not support undo/redo.
 */
export interface Command<TStore, TParams, TReturn, TSchema extends Primitive.AnyPrimitive = Primitive.AnyPrimitive> {
  readonly [COMMAND_SYMBOL]: true;
  readonly fn: CommandFn<TStore, TParams, TReturn, TSchema>;
}

/**
 * An undoable command that supports undo/redo.
 * Must provide a revert function that knows how to undo the change.
 */
export interface UndoableCommand<TStore, TParams, TReturn, TSchema extends Primitive.AnyPrimitive = Primitive.AnyPrimitive>
  extends Command<TStore, TParams, TReturn, TSchema> {
  readonly [UNDOABLE_COMMAND_SYMBOL]: true;
  readonly revert: RevertFn<TStore, TParams, TReturn, TSchema>;
}

/**
 * Any command type (regular or undoable).
 */
export type AnyCommand = Command<any, any, any>;

/**
 * Any undoable command type.
 */
export type AnyUndoableCommand = UndoableCommand<any, any, any>;

// =============================================================================
// Command Dispatch
// =============================================================================

/**
 * Dispatch function that accepts commands and returns a function to call with params.
 * Returns the result of the command execution.
 *
 * @example
 * const result = dispatch(myCommand)({ param: "value" });
 */
export type CommandDispatch<TStore, TSchema extends Primitive.AnyPrimitive = Primitive.AnyPrimitive> = <TParams, TReturn>(
  command: Command<TStore, TParams, TReturn, TSchema>
) => (params: TParams) => TReturn;

// =============================================================================
// Undo/Redo Stack Types
// =============================================================================

/**
 * An entry in the undo/redo stack.
 * Contains all information needed to revert or redo a command.
 */
export interface UndoEntry<TParams = unknown, TReturn = unknown> {
  /** The undoable command that was executed */
  readonly command: AnyUndoableCommand;
  /** The parameters that were passed to the command */
  readonly params: TParams;
  /** The result returned by the command (passed to revert) */
  readonly result: TReturn;
  /** Timestamp when the command was executed */
  readonly timestamp: number;
}

/**
 * State slice for undo/redo functionality.
 */
export interface CommanderSlice {
  readonly _commander: {
    /** Stack of commands that can be undone */
    readonly undoStack: ReadonlyArray<UndoEntry>;
    /** Stack of commands that can be redone */
    readonly redoStack: ReadonlyArray<UndoEntry>;
    /** Active draft handle, if any. When set, transactions route through the draft and undo is disabled. */
    readonly activeDraft: ClientDocument.DraftHandle<any> | null;
  };
}

// =============================================================================
// Commander Types
// =============================================================================

/**
 * Options for creating a commander.
 */
export interface CommanderOptions {
  /**
   * Maximum number of undo entries to keep.
   * @default 100
   */
  readonly maxUndoStackSize?: number;
}

/**
 * A commander instance bound to a specific store type.
 * Used to create commands and the middleware.
 */
export interface Commander<TStore, TSchema extends Primitive.AnyPrimitive = Primitive.AnyPrimitive> {
  /**
   * Create a regular command (no undo support).
   *
   * @example
   * // With params
   * const addItem = commander.action<{ name: string }>(
   *   (ctx, params) => {
   *     // modify state using params.name
   *   }
   * );
   *
   * // Without params
   * const clearAll = commander.action((ctx) => {
   *   // modify state
   * });
   */
  readonly action: {
    // With params (explicit type parameter)
    <TParams, TReturn = void>(
      fn: CommandFn<TStore, TParams, TReturn, TSchema>
    ): Command<TStore, TParams, TReturn, TSchema>;

    // Without params (void) - inferred when no type param provided
    <TReturn = void>(
      fn: CommandFn<TStore, void, TReturn, TSchema>
    ): Command<TStore, void, TReturn, TSchema>;
  };

  /**
   * Create an undoable command with undo/redo support.
   * The revert function is called when undoing the command.
   *
   * @example
   * const moveItem = commander.undoableAction<{ id: string; toIndex: number }, { fromIndex: number }>(
   *   (ctx, params) => {
   *     const fromIndex = // get current index
   *     // perform move
   *     return { fromIndex }; // return data needed for revert
   *   },
   *   (ctx, params, result) => {
   *     // revert: move back to original position
   *     ctx.dispatch(moveItem)({ id: params.id, toIndex: result.fromIndex });
   *   }
   * );
   */
  readonly undoableAction: {
    // With params (explicit type parameter)
    <TParams, TReturn>(
      fn: CommandFn<TStore, TParams, TReturn, TSchema>,
      revert: RevertFn<TStore, TParams, TReturn, TSchema>
    ): UndoableCommand<TStore, TParams, TReturn, TSchema>;

    // Without params (void)
    <TReturn>(
      fn: CommandFn<TStore, void, TReturn, TSchema>,
      revert: RevertFn<TStore, void, TReturn, TSchema>
    ): UndoableCommand<TStore, void, TReturn, TSchema>;
  };

  /**
   * Zustand middleware that adds commander functionality.
   * Adds undo/redo stacks to the store state.
   */
  readonly middleware: CommanderMiddleware<TStore>;
}

/**
 * Type for the commander middleware.
 * Note: TStore is intentionally unused here to match the Commander interface signature.
 * The middleware is generic over T (the inner store type) and adds CommanderSlice.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type CommanderMiddleware<_TStore> = <T extends object>(
  config: (
    set: StoreApi<T & CommanderSlice>["setState"],
    get: StoreApi<T & CommanderSlice>["getState"],
    api: StoreApi<T & CommanderSlice>
  ) => T
) => (
  set: StoreApi<T & CommanderSlice>["setState"],
  get: StoreApi<T & CommanderSlice>["getState"],
  api: StoreApi<T & CommanderSlice>
) => T & CommanderSlice;

// =============================================================================
// Type Helpers
// =============================================================================

/**
 * Extract the params type from a command.
 */
export type CommandParams<T> = T extends Command<any, infer P, any> ? P : never;

/**
 * Extract the return type from a command.
 */
export type CommandReturn<T> = T extends Command<any, any, infer R>
  ? R
  : undefined;

/**
 * Extract the store type from a command.
 */
export type CommandStore<T> = T extends Command<infer S, any, any> ? S : never;

// =============================================================================
// Type Guards
// =============================================================================

/**
 * Type guard to check if a value is a Command.
 */
export function isCommand(value: unknown): value is AnyCommand {
  return (
    typeof value === "object" &&
    value !== null &&
    COMMAND_SYMBOL in value &&
    value[COMMAND_SYMBOL] === true
  );
}

/**
 * Type guard to check if a command is undoable.
 */
export function isUndoableCommand(
  value: unknown
): value is AnyUndoableCommand {
  return (
    isCommand(value) &&
    UNDOABLE_COMMAND_SYMBOL in value &&
    value[UNDOABLE_COMMAND_SYMBOL] === true
  );
}

// =============================================================================
// Store Type Helper
// =============================================================================

/**
 * Helper type to extract the state type from a zustand store.
 */
export type ExtractState<TStore> = TStore extends UseBoundStore<
  StoreApi<infer S>
>
  ? S
  : TStore extends StoreApi<infer S>
    ? S
    : never;

