/**
 * @voidhash/mimic-react/zustand-commander
 *
 * Type definitions for the zustand-commander package.
 *
 * @since 0.0.1
 */

import type { Schema } from "effect";
import type { StoreApi, UseBoundStore } from "zustand";

// =============================================================================
// Schema Types
// =============================================================================

/**
 * Any Effect Schema type (used for type constraints).
 */
export type AnyEffectSchema = Schema.Schema<any, any, any>;

/**
 * Infer the Type from an Effect Schema.
 */
export type InferSchemaType<T> = T extends Schema.Schema<infer A, any, any>
  ? A
  : never;

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
export interface CommandContext<TStore> {
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
  readonly dispatch: CommandDispatch<TStore>;
}

// =============================================================================
// Command Function Types
// =============================================================================

/**
 * The function signature for a command handler.
 */
export type CommandFn<TStore, TParams, TReturn> = (
  ctx: CommandContext<TStore>,
  params: TParams
) => TReturn;

/**
 * The function signature for an undoable command's revert handler.
 * Receives the original params and the result from the forward execution.
 */
export type RevertFn<TStore, TParams, TReturn> = (
  ctx: CommandContext<TStore>,
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
export interface Command<TStore, TParams, TReturn> {
  readonly [COMMAND_SYMBOL]: true;
  readonly fn: CommandFn<TStore, TParams, TReturn>;
  readonly paramsSchema: AnyEffectSchema | null;
}

/**
 * An undoable command that supports undo/redo.
 * Must provide a revert function that knows how to undo the change.
 */
export interface UndoableCommand<TStore, TParams, TReturn>
  extends Command<TStore, TParams, TReturn> {
  readonly [UNDOABLE_COMMAND_SYMBOL]: true;
  readonly revert: RevertFn<TStore, TParams, TReturn>;
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
export type CommandDispatch<TStore> = <TParams, TReturn>(
  command: Command<TStore, TParams, TReturn>
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
export interface Commander<TStore> {
  /**
   * Create a regular command (no undo support).
   *
   * @example
   * // With params schema
   * const addItem = commander.action(
   *   Schema.Struct({ name: Schema.String }),
   *   (ctx, params) => {
   *     // modify state
   *   }
   * );
   *
   * // Without params
   * const clearAll = commander.action((ctx) => {
   *   // modify state
   * });
   */
  readonly action: {
    // With params schema
    <TParamsSchema extends AnyEffectSchema, TReturn = void>(
      paramsSchema: TParamsSchema,
      fn: CommandFn<TStore, InferSchemaType<TParamsSchema>, TReturn>
    ): Command<TStore, InferSchemaType<TParamsSchema>, TReturn>;

    // Without params (void)
    <TReturn = void>(
      fn: CommandFn<TStore, void, TReturn>
    ): Command<TStore, void, TReturn>;
  };

  /**
   * Create an undoable command with undo/redo support.
   * The revert function is called when undoing the command.
   *
   * @example
   * const moveItem = commander.undoableAction(
   *   Schema.Struct({ id: Schema.String, toIndex: Schema.Number }),
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
    // With params schema
    <TParamsSchema extends AnyEffectSchema, TReturn>(
      paramsSchema: TParamsSchema,
      fn: CommandFn<TStore, InferSchemaType<TParamsSchema>, TReturn>,
      revert: RevertFn<TStore, InferSchemaType<TParamsSchema>, TReturn>
    ): UndoableCommand<TStore, InferSchemaType<TParamsSchema>, TReturn>;

    // Without params (void)
    <TReturn>(
      fn: CommandFn<TStore, void, TReturn>,
      revert: RevertFn<TStore, void, TReturn>
    ): UndoableCommand<TStore, void, TReturn>;
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

