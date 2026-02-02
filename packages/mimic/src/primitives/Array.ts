import { Effect, Schema } from "effect";
import * as OperationDefinition from "../OperationDefinition";
import * as Operation from "../Operation";
import * as OperationPath from "../OperationPath";
import * as ProxyEnvironment from "../ProxyEnvironment";
import * as Transform from "../Transform";
import * as FractionalIndex from "../FractionalIndex";
import type { Primitive, PrimitiveInternal, MaybeUndefined, AnyPrimitive, Validator, InferState, InferProxy, InferSnapshot, InferSetInput } from "../Primitive";
import { ValidationError } from "../Primitive";
import { runValidators, applyDefaults } from "./shared";
import { StructPrimitive, StructSetInput } from "./Struct";


/**
 * Entry in an ordered array with ID and fractional position
 */
export interface ArrayEntry<T> {
  readonly id: string;    // Unique element identifier (UUID)
  readonly pos: string;   // Fractional index for ordering
  readonly value: T;      // The element value
}

/**
 * Sort array entries by their fractional position
 */
const sortByPos = <T,>(entries: readonly ArrayEntry<T>[]): ArrayEntry<T>[] =>
  [...entries].sort((a, b) => a.pos < b.pos ? -1 : a.pos > b.pos ? 1 : 0);

/**
 * Generate a fractional position between two positions
 */
const generatePosBetween = (left: string | null, right: string | null): string => {
  const charSet = FractionalIndex.base62CharSet();
  return Effect.runSync(FractionalIndex.generateKeyBetween(left, right, charSet));
};

/**
 * Entry in an array snapshot with ID and value snapshot
 */
export interface ArrayEntrySnapshot<TElement extends AnyPrimitive> {
  readonly id: string;
  readonly value: InferSnapshot<TElement>;
}

/**
 * Snapshot type for arrays - always an array (never undefined)
 */
export type ArraySnapshot<TElement extends AnyPrimitive> = readonly ArrayEntrySnapshot<TElement>[];

/**
 * Compute the input type for array element values.
 * Uses StructSetInput directly for struct elements so that:
 * - Fields that are required AND have no default must be provided
 * - Fields that are optional OR have defaults can be omitted
 * 
 * For non-struct elements, falls back to InferSetInput.
 */
export type ArrayElementSetInput<TElement extends AnyPrimitive> = 
  TElement extends StructPrimitive<infer TFields, any, any>
    ? StructSetInput<TFields>
    : InferSetInput<TElement>;

export interface ArrayProxy<TElement extends AnyPrimitive> {
  /** Gets the current array entries (sorted by position) */
  get(): ArrayState<TElement>;
  /** Replaces the entire array with new values (generates new IDs and positions, applies defaults) */
  set(values: readonly ArrayElementSetInput<TElement>[]): void;
  /** Appends a value to the end of the array (applies defaults for struct elements) */
  push(value: ArrayElementSetInput<TElement>): void;
  /** Inserts a value at the specified visual index (applies defaults for struct elements) */
  insertAt(index: number, value: ArrayElementSetInput<TElement>): void;
  /** Removes the element with the specified ID */
  remove(id: string): void;
  /** Moves an element to a new visual index */
  move(id: string, toIndex: number): void;
  /** Returns a proxy for the element with the specified ID */
  at(id: string): InferProxy<TElement>;
  /** Finds an element by predicate and returns its proxy */
  find(predicate: (value: InferState<TElement>, id: string) => boolean): InferProxy<TElement> | undefined;
  /** Returns a readonly snapshot of the array for rendering (always returns an array, never undefined) */
  toSnapshot(): ArraySnapshot<TElement>;
}

/** The state type for arrays - an array of entries */
export type ArrayState<TElement extends AnyPrimitive> = readonly ArrayEntry<InferState<TElement>>[];

interface ArrayPrimitiveSchema<TElement extends AnyPrimitive> {
  readonly required: boolean;
  readonly defaultValue: ArrayState<TElement> | undefined;
  readonly element: TElement;
  readonly validators: readonly Validator<ArrayState<TElement>>[];
}

/** Input type for array set() - an array of element set inputs */
export type ArraySetInput<TElement extends AnyPrimitive> = readonly ArrayElementSetInput<TElement>[];

/** Input type for array update() - same as set() for arrays */
export type ArrayUpdateInput<TElement extends AnyPrimitive> = readonly ArrayElementSetInput<TElement>[];

export class ArrayPrimitive<TElement extends AnyPrimitive, TRequired extends boolean = false, THasDefault extends boolean = false>
  implements Primitive<ArrayState<TElement>, ArrayProxy<TElement>, TRequired, THasDefault, ArraySetInput<TElement>, ArrayUpdateInput<TElement>>
{
  readonly _tag = "ArrayPrimitive" as const;
  readonly _State!: ArrayState<TElement>;
  readonly _Proxy!: ArrayProxy<TElement>;
  readonly _TRequired!: TRequired;
  readonly _THasDefault!: THasDefault;
  readonly TSetInput!: ArraySetInput<TElement>;
  readonly TUpdateInput!: ArrayUpdateInput<TElement>;

  private readonly _schema: ArrayPrimitiveSchema<TElement>;

  private readonly _opDefinitions = {
    set: OperationDefinition.make({
      kind: "array.set" as const,
      payload: Schema.Unknown,
      target: Schema.Unknown,
      apply: (payload) => payload,
      deduplicable: true,
    }),
    insert: OperationDefinition.make({
      kind: "array.insert" as const,
      payload: Schema.Unknown,
      target: Schema.Unknown,
      apply: (payload) => payload,
    }),
    remove: OperationDefinition.make({
      kind: "array.remove" as const,
      payload: Schema.Unknown,
      target: Schema.Unknown,
      apply: (payload) => payload,
    }),
    move: OperationDefinition.make({
      kind: "array.move" as const,
      payload: Schema.Unknown,
      target: Schema.Unknown,
      apply: (payload) => payload,
    }),
  };

  constructor(schema: ArrayPrimitiveSchema<TElement>) {
    this._schema = schema;
  }

  /** Mark this array as required */
  required(): ArrayPrimitive<TElement, true, THasDefault> {
    return new ArrayPrimitive({
      ...this._schema,
      required: true,
    });
  }

  /** Set a default value for this array */
  default(defaultValue: ArrayState<TElement>): ArrayPrimitive<TElement, TRequired, true> {
    return new ArrayPrimitive({
      ...this._schema,
      defaultValue,
    });
  }

  /** Get the element primitive */
  get element(): TElement {
    return this._schema.element;
  }

  /** Add a custom validation rule */
  refine(fn: (value: ArrayState<TElement>) => boolean, message: string): ArrayPrimitive<TElement, TRequired, THasDefault> {
    return new ArrayPrimitive({
      ...this._schema,
      validators: [...this._schema.validators, { validate: fn, message }],
    });
  }

  /** Minimum array length */
  minLength(length: number): ArrayPrimitive<TElement, TRequired, THasDefault> {
    return this.refine(
      (v) => v.length >= length,
      `Array must have at least ${length} elements`
    );
  }

  /** Maximum array length */
  maxLength(length: number): ArrayPrimitive<TElement, TRequired, THasDefault> {
    return this.refine(
      (v) => v.length <= length,
      `Array must have at most ${length} elements`
    );
  }

  readonly _internal: PrimitiveInternal<ArrayState<TElement>, ArrayProxy<TElement>> = {
    createProxy: (env: ProxyEnvironment.ProxyEnvironment, operationPath: OperationPath.OperationPath): ArrayProxy<TElement> => {
      const elementPrimitive = this._schema.element;

      // Helper to get current state (sorted)
      const getCurrentState = (): ArrayEntry<InferState<TElement>>[] => {
        const state = env.getState(operationPath) as ArrayState<TElement> | undefined;
        if (!state || !globalThis.Array.isArray(state)) return [];
        return sortByPos(state);
      };

      // Helper to apply defaults for element values
      const applyElementDefaults = (value: ArrayElementSetInput<TElement>): InferState<TElement> => {
        return applyDefaults(elementPrimitive, value as Partial<InferState<TElement>>) as InferState<TElement>;
      };

      return {
        get: (): ArrayState<TElement> => {
          return getCurrentState();
        },

        set: (values: readonly ArrayElementSetInput<TElement>[]) => {
          // Generate entries with new IDs and sequential positions
          const entries: ArrayEntry<InferState<TElement>>[] = [];
          let prevPos: string | null = null;
          
          for (const value of values) {
            const id = env.generateId();
            const pos = generatePosBetween(prevPos, null);
            // Apply defaults to element value
            const mergedValue = applyElementDefaults(value);
            entries.push({ id, pos, value: mergedValue });
            prevPos = pos;
          }
          
          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.set, entries)
          );
        },

        push: (value: ArrayElementSetInput<TElement>) => {
          const sorted = getCurrentState();
          const lastPos = sorted.length > 0 ? sorted[sorted.length - 1]!.pos : null;
          const id = env.generateId();
          const pos = generatePosBetween(lastPos, null);
          // Apply defaults to element value
          const mergedValue = applyElementDefaults(value);
          
          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.insert, { id, pos, value: mergedValue })
          );
        },

        insertAt: (index: number, value: ArrayElementSetInput<TElement>) => {
          const sorted = getCurrentState();
          const leftPos = index > 0 && sorted[index - 1] ? sorted[index - 1]!.pos : null;
          const rightPos = index < sorted.length && sorted[index] ? sorted[index]!.pos : null;
          
          const id = env.generateId();
          const pos = generatePosBetween(leftPos, rightPos);
          // Apply defaults to element value
          const mergedValue = applyElementDefaults(value);
          
          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.insert, { id, pos, value: mergedValue })
          );
        },

        remove: (id: string) => {
          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.remove, { id })
          );
        },

        move: (id: string, toIndex: number) => {
          const sorted = getCurrentState();
          // Filter out the element being moved
          const without = sorted.filter(e => e.id !== id);
          
          const clampedIndex = Math.max(0, Math.min(toIndex, without.length));
          const leftPos = clampedIndex > 0 && without[clampedIndex - 1] ? without[clampedIndex - 1]!.pos : null;
          const rightPos = clampedIndex < without.length && without[clampedIndex] ? without[clampedIndex]!.pos : null;
          
          const pos = generatePosBetween(leftPos, rightPos);
          
          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.move, { id, pos })
          );
        },

        at: (id: string): InferProxy<TElement> => {
          // Use ID in path for element access
          const elementPath = operationPath.append(id);
          return elementPrimitive._internal.createProxy(env, elementPath) as InferProxy<TElement>;
        },

        find: (predicate: (value: InferState<TElement>, id: string) => boolean): InferProxy<TElement> | undefined => {
          const sorted = getCurrentState();
          const found = sorted.find(entry => predicate(entry.value, entry.id));
          if (!found) return undefined;
          
          const elementPath = operationPath.append(found.id);
          return elementPrimitive._internal.createProxy(env, elementPath) as InferProxy<TElement>;
        },

        toSnapshot: (): ArraySnapshot<TElement> => {
          const sorted = getCurrentState();
          return sorted.map(entry => {
            const elementPath = operationPath.append(entry.id);
            const elementProxy = elementPrimitive._internal.createProxy(env, elementPath);
            return {
              id: entry.id,
              value: (elementProxy as { toSnapshot(): InferSnapshot<TElement> }).toSnapshot(),
            };
          });
        },
      };
    },

    applyOperation: (
      state: ArrayState<TElement> | undefined,
      operation: Operation.Operation<any, any, any>
    ): ArrayState<TElement> => {
      const path = operation.path;
      const tokens = path.toTokens().filter((t: string) => t !== "");
      const currentState = state ?? [];

      let newState: ArrayState<TElement>;

      // If path is empty, this is an array-level operation
      if (tokens.length === 0) {
        switch (operation.kind) {
          case "array.set": {
            const payload = operation.payload;
            if (!globalThis.Array.isArray(payload)) {
              throw new ValidationError(`ArrayPrimitive.set requires an array payload`);
            }
            newState = payload as ArrayState<TElement>;
            break;
          }
          case "array.insert": {
            const { id, pos, value } = operation.payload as { id: string; pos: string; value: InferState<TElement> };
            newState = [...currentState, { id, pos, value }];
            break;
          }
          case "array.remove": {
            const { id } = operation.payload as { id: string };
            newState = currentState.filter(entry => entry.id !== id);
            break;
          }
          case "array.move": {
            const { id, pos } = operation.payload as { id: string; pos: string };
            newState = currentState.map(entry => 
              entry.id === id ? { ...entry, pos } : entry
            );
            break;
          }
          default:
            throw new ValidationError(`ArrayPrimitive cannot apply operation of kind: ${operation.kind}`);
        }
      } else {
        // Otherwise, delegate to the element with the specified ID
        const elementId = tokens[0]!;
        const entryIndex = currentState.findIndex(entry => entry.id === elementId);
        
        if (entryIndex === -1) {
          throw new ValidationError(`Array element not found with ID: ${elementId}`);
        }

        const elementPrimitive = this._schema.element;
        const remainingPath = path.shift();
        const elementOperation = {
          ...operation,
          path: remainingPath,
        };

        const currentEntry = currentState[entryIndex]!;
        const newValue = elementPrimitive._internal.applyOperation(currentEntry.value, elementOperation);

        const mutableState = [...currentState];
        mutableState[entryIndex] = { ...currentEntry, value: newValue };
        newState = mutableState;
      }

      // Run validators on the new state
      runValidators(newState, this._schema.validators);

      return newState;
    },

    getInitialState: (): ArrayState<TElement> | undefined => {
      return this._schema.defaultValue;
    },

    transformOperation: (
      clientOp: Operation.Operation<any, any, any>,
      serverOp: Operation.Operation<any, any, any>
    ): Transform.TransformResult => {
      const clientPath = clientOp.path;
      const serverPath = serverOp.path;

      // If paths don't overlap at all, no transformation needed
      if (!OperationPath.pathsOverlap(clientPath, serverPath)) {
        return { type: "transformed", operation: clientOp };
      }

      // Handle array.remove from server - check if client is operating on removed element
      if (serverOp.kind === "array.remove") {
        const removedId = (serverOp.payload as { id: string }).id;
        const clientTokens = clientPath.toTokens().filter((t: string) => t !== "");
        const serverTokens = serverPath.toTokens().filter((t: string) => t !== "");

        // Check if client is operating on the removed element or its children
        if (clientTokens.length > serverTokens.length) {
          const elementId = clientTokens[serverTokens.length];
          if (elementId === removedId) {
            // Client operation targets a removed element - becomes noop
            return { type: "noop" };
          }
        }
      }

      // Both inserting into same array - no conflict (fractional indexing handles ordering)
      if (serverOp.kind === "array.insert" && clientOp.kind === "array.insert") {
        return { type: "transformed", operation: clientOp };
      }

      // Both moving elements in same array
      if (serverOp.kind === "array.move" && clientOp.kind === "array.move") {
        const serverMoveId = (serverOp.payload as { id: string }).id;
        const clientMoveId = (clientOp.payload as { id: string }).id;

        if (serverMoveId === clientMoveId) {
          // Client's move supersedes server's move (last-write-wins for position)
          return { type: "transformed", operation: clientOp };
        }
        // Different elements - no conflict
        return { type: "transformed", operation: clientOp };
      }

      // For operations on same exact path: client wins (last-write-wins)
      if (OperationPath.pathsEqual(clientPath, serverPath)) {
        return { type: "transformed", operation: clientOp };
      }

      // If server set entire array and client is operating on an element
      if (serverOp.kind === "array.set" && OperationPath.isPrefix(serverPath, clientPath)) {
        // Client's element operation may be invalid after array replacement
        // However, for optimistic updates, we let the client op proceed
        // and the server will validate/reject if needed
        return { type: "transformed", operation: clientOp };
      }

      // Delegate to element primitive for nested operations
      const clientTokens = clientPath.toTokens().filter((t: string) => t !== "");
      const serverTokens = serverPath.toTokens().filter((t: string) => t !== "");

      // Both operations target children of this array
      if (clientTokens.length > 0 && serverTokens.length > 0) {
        const clientElementId = clientTokens[0];
        const serverElementId = serverTokens[0];

        // If operating on different elements, no conflict
        if (clientElementId !== serverElementId) {
          return { type: "transformed", operation: clientOp };
        }

        // Same element - delegate to element primitive
        const elementPrimitive = this._schema.element;
        const clientOpForElement = {
          ...clientOp,
          path: clientOp.path.shift(),
        };
        const serverOpForElement = {
          ...serverOp,
          path: serverOp.path.shift(),
        };

        const result = elementPrimitive._internal.transformOperation(clientOpForElement, serverOpForElement);

        if (result.type === "transformed") {
          // Restore the original path prefix
          return {
            type: "transformed",
            operation: {
              ...result.operation,
              path: clientOp.path,
            },
          };
        }

        return result;
      }

      // Default: no transformation needed
      return { type: "transformed", operation: clientOp };
    },
  };
}

/** Creates a new ArrayPrimitive with the given element type */
export const Array = <TElement extends AnyPrimitive>(element: TElement): ArrayPrimitive<TElement, false, false> =>
  new ArrayPrimitive({ required: false, defaultValue: undefined, element, validators: [] });

