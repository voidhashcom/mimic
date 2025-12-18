import { Effect, Schema } from "effect";
import * as OperationDefinition from "./OperationDefinition";
import * as Operation from "./Operation";
import * as OperationPath from "./OperationPath";
import * as Proxy from "./Proxy";
import * as ProxyEnvironment from "./ProxyEnvironment";
import * as FractionalIndex from "./FractionalIndex";
import * as Transform from "./Transform";

// =============================================================================
// Primitive Interface & Type Utilities
// =============================================================================

/**
 * Base interface that all primitives must implement.
 * Provides type inference helpers and internal operations.
 */
export interface Primitive<TState, TProxy> {
  readonly _tag: string;
  readonly _State: TState;
  readonly _Proxy: TProxy;
  readonly _internal: PrimitiveInternal<TState, TProxy>;
}

/**
 * Internal operations that each primitive must provide.
 */
export interface PrimitiveInternal<TState, TProxy> {
  /** Creates a proxy for generating operations */
  readonly createProxy: (env: ProxyEnvironment.ProxyEnvironment, path: OperationPath.OperationPath) => TProxy;
  /** Applies an operation to the current state, returning the new state */
  readonly applyOperation: (state: TState | undefined, operation: Operation.Operation<any, any, any>) => TState;
  /** Returns the initial/default state for this primitive */
  readonly getInitialState: () => TState | undefined;
  /**
   * Transforms a client operation against a server operation.
   * Used for operational transformation (OT) conflict resolution.
   * 
   * @param clientOp - The client's operation to transform
   * @param serverOp - The server's operation that has already been applied
   * @returns TransformResult indicating how the client operation should be handled
   */
  readonly transformOperation: (
    clientOp: Operation.Operation<any, any, any>,
    serverOp: Operation.Operation<any, any, any>
  ) => Transform.TransformResult;
}

/**
 * Any primitive type - used for generic constraints.
 */
export type AnyPrimitive = Primitive<any, any>;

/**
 * Infer the state type from a primitive.
 */
export type InferState<T> = T extends Primitive<infer S, any> ? S : never;

/**
 * Infer the proxy type from a primitive.
 */
export type InferProxy<T> = T extends Primitive<any, infer P> ? P : never;

// =============================================================================
// Validation Errors
// =============================================================================

export class ValidationError extends Error {
  readonly _tag = "ValidationError";
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

// =============================================================================
// String Primitive
// =============================================================================

export interface StringProxy {
  /** Gets the current string value */
  get(): string | undefined;
  /** Sets the string value, generating a string.set operation */
  set(value: string): void;
}

interface StringPrimitiveSchema {
  readonly required: boolean;
  readonly defaultValue: string | undefined;
}

export class StringPrimitive implements Primitive<string, StringProxy> {
  readonly _tag = "StringPrimitive" as const;
  readonly _State!: string;
  readonly _Proxy!: StringProxy;

  private readonly _schema: StringPrimitiveSchema;

  private readonly _opDefinitions = {
    set: OperationDefinition.make({
      kind: "string.set" as const,
      payload: Schema.String,
      target: Schema.String,
      apply: (payload) => payload,
    }),
  };

  constructor(schema: StringPrimitiveSchema) {
    this._schema = schema;
  }

  /** Mark this string as required */
  required(): StringPrimitive {
    return new StringPrimitive({
      ...this._schema,
      required: true,
    });
  }

  /** Set a default value for this string */
  default(defaultValue: string): StringPrimitive {
    return new StringPrimitive({
      ...this._schema,
      defaultValue,
    });
  }

  readonly _internal: PrimitiveInternal<string, StringProxy> = {
    createProxy: (env: ProxyEnvironment.ProxyEnvironment, operationPath: OperationPath.OperationPath): StringProxy => {
      return {
        get: (): string | undefined => {
          return env.getState(operationPath) as string | undefined;
        },
        set: (value: string) => {
          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.set, value)
          );
        },
      };
    },

    applyOperation: (state: string | undefined, operation: Operation.Operation<any, any, any>): string => {
      if (operation.kind !== "string.set") {
        throw new ValidationError(`StringPrimitive cannot apply operation of kind: ${operation.kind}`);
      }

      const payload = operation.payload;
      if (typeof payload !== "string") {
        throw new ValidationError(`StringPrimitive.set requires a string payload, got: ${typeof payload}`);
      }

      return payload;
    },

    getInitialState: (): string | undefined => {
      return this._schema.defaultValue;
    },

    transformOperation: (
      clientOp: Operation.Operation<any, any, any>,
      serverOp: Operation.Operation<any, any, any>
    ): Transform.TransformResult => {
      // If paths don't overlap, no transformation needed
      if (!OperationPath.pathsOverlap(clientOp.path, serverOp.path)) {
        return { type: "transformed", operation: clientOp };
      }

      // For same path, client wins (last-write-wins)
      // Client operation proceeds as-is
      return { type: "transformed", operation: clientOp };
    },
  };
}

/** Creates a new StringPrimitive */
export const String = (): StringPrimitive =>
  new StringPrimitive({ required: false, defaultValue: undefined });

// =============================================================================
// Struct Primitive
// =============================================================================

/**
 * Maps a schema definition to its state type.
 * { name: StringPrimitive, age: NumberPrimitive } -> { name: string, age: number }
 */
export type InferStructState<TFields extends Record<string, AnyPrimitive>> = {
  readonly [K in keyof TFields]: InferState<TFields[K]>;
};

/**
 * Maps a schema definition to its proxy type.
 * Provides nested field access + get()/set() methods for the whole struct.
 */
export type StructProxy<TFields extends Record<string, AnyPrimitive>> = {
  readonly [K in keyof TFields]: InferProxy<TFields[K]>;
} & {
  /** Gets the entire struct value */
  get(): InferStructState<TFields> | undefined;
  /** Sets the entire struct value */
  set(value: InferStructState<TFields>): void;
};

interface StructPrimitiveSchema<TFields extends Record<string, AnyPrimitive>> {
  readonly required: boolean;
  readonly defaultValue: InferStructState<TFields> | undefined;
  readonly fields: TFields;
}

export class StructPrimitive<TFields extends Record<string, AnyPrimitive>>
  implements Primitive<InferStructState<TFields>, StructProxy<TFields>>
{
  readonly _tag = "StructPrimitive" as const;
  readonly _State!: InferStructState<TFields>;
  readonly _Proxy!: StructProxy<TFields>;

  private readonly _schema: StructPrimitiveSchema<TFields>;

  private readonly _opDefinitions = {
    set: OperationDefinition.make({
      kind: "struct.set" as const,
      payload: Schema.Unknown,
      target: Schema.Unknown,
      apply: (payload) => payload,
    }),
  };

  constructor(schema: StructPrimitiveSchema<TFields>) {
    this._schema = schema;
  }

  /** Mark this struct as required */
  required(): StructPrimitive<TFields> {
    return new StructPrimitive({
      ...this._schema,
      required: true,
    });
  }

  /** Set a default value for this struct */
  default(defaultValue: InferStructState<TFields>): StructPrimitive<TFields> {
    return new StructPrimitive({
      ...this._schema,
      defaultValue,
    });
  }

  /** Get the fields schema */
  get fields(): TFields {
    return this._schema.fields;
  }

  readonly _internal: PrimitiveInternal<InferStructState<TFields>, StructProxy<TFields>> = {
    createProxy: (env: ProxyEnvironment.ProxyEnvironment, operationPath: OperationPath.OperationPath): StructProxy<TFields> => {
      const fields = this._schema.fields;

      // Create the base object with get/set methods
      const base = {
        get: (): InferStructState<TFields> | undefined => {
          return env.getState(operationPath) as InferStructState<TFields> | undefined;
        },
        set: (value: InferStructState<TFields>) => {
          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.set, value)
          );
        },
      };

      // Use a JavaScript Proxy to intercept field access
      return new globalThis.Proxy(base as StructProxy<TFields>, {
        get: (target, prop, receiver) => {
          // Return base methods (get, set)
          if (prop === "get") {
            return target.get;
          }
          if (prop === "set") {
            return target.set;
          }

          // Handle symbol properties (like Symbol.toStringTag)
          if (typeof prop === "symbol") {
            return undefined;
          }

          // Check if prop is a field in the schema
          if (prop in fields) {
            const fieldPrimitive = fields[prop as keyof TFields]!;
            const fieldPath = operationPath.append(prop as string);
            return fieldPrimitive._internal.createProxy(env, fieldPath);
          }

          return undefined;
        },
        has: (target, prop) => {
          if (prop === "get" || prop === "set") return true;
          if (typeof prop === "string" && prop in fields) return true;
          return false;
        },
      });
    },

    applyOperation: (
      state: InferStructState<TFields> | undefined,
      operation: Operation.Operation<any, any, any>
    ): InferStructState<TFields> => {
      const path = operation.path;
      const tokens = path.toTokens().filter((t: string) => t !== "");

      // If path is empty or root, this is a struct.set operation
      if (tokens.length === 0) {
        if (operation.kind !== "struct.set") {
          throw new ValidationError(`StructPrimitive root cannot apply operation of kind: ${operation.kind}`);
        }

        const payload = operation.payload;
        if (typeof payload !== "object" || payload === null) {
          throw new ValidationError(`StructPrimitive.set requires an object payload`);
        }

        // Validate all required fields exist
        return payload as InferStructState<TFields>;
      }

      // Otherwise, delegate to the appropriate field primitive
      const fieldName = tokens[0] as keyof TFields;
      if (!(fieldName in this._schema.fields)) {
        throw new ValidationError(`Unknown field: ${globalThis.String(fieldName)}`);
      }

      const fieldPrimitive = this._schema.fields[fieldName]!;
      const remainingPath = path.shift();
      const fieldOperation = {
        ...operation,
        path: remainingPath,
      };

      // Get the current field state
      const currentState = state ?? ({} as InferStructState<TFields>);
      const currentFieldState = currentState[fieldName] as InferState<typeof fieldPrimitive> | undefined;

      // Apply the operation to the field
      const newFieldState = fieldPrimitive._internal.applyOperation(currentFieldState, fieldOperation);

      // Return updated state
      return {
        ...currentState,
        [fieldName]: newFieldState,
      };
    },

    getInitialState: (): InferStructState<TFields> | undefined => {
      if (this._schema.defaultValue !== undefined) {
        return this._schema.defaultValue;
      }

      // Build initial state from field defaults
      const fields = this._schema.fields;
      const initialState: Record<string, unknown> = {};
      let hasAnyDefault = false;

      for (const key in fields) {
        const fieldDefault = fields[key]!._internal.getInitialState();
        if (fieldDefault !== undefined) {
          initialState[key] = fieldDefault;
          hasAnyDefault = true;
        }
      }

      return hasAnyDefault ? (initialState as InferStructState<TFields>) : undefined;
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

      const clientTokens = clientPath.toTokens().filter((t: string) => t !== "");
      const serverTokens = serverPath.toTokens().filter((t: string) => t !== "");

      // If both are at root level (struct.set operations)
      if (clientTokens.length === 0 && serverTokens.length === 0) {
        // Client wins (last-write-wins)
        return { type: "transformed", operation: clientOp };
      }

      // If server set entire struct and client is updating a field
      if (serverTokens.length === 0 && serverOp.kind === "struct.set") {
        // Client's field operation proceeds - optimistic update
        // Server will validate/reject if needed
        return { type: "transformed", operation: clientOp };
      }

      // If client set entire struct and server is updating a field
      if (clientTokens.length === 0 && clientOp.kind === "struct.set") {
        // Client's struct.set supersedes server's field update
        return { type: "transformed", operation: clientOp };
      }

      // Both operations target fields
      if (clientTokens.length > 0 && serverTokens.length > 0) {
        const clientField = clientTokens[0] as keyof TFields;
        const serverField = serverTokens[0] as keyof TFields;

        // Different fields - no conflict
        if (clientField !== serverField) {
          return { type: "transformed", operation: clientOp };
        }

        // Same field - delegate to field primitive
        const fieldPrimitive = this._schema.fields[clientField];
        if (!fieldPrimitive) {
          return { type: "transformed", operation: clientOp };
        }

        const clientOpForField = {
          ...clientOp,
          path: clientOp.path.shift(),
        };
        const serverOpForField = {
          ...serverOp,
          path: serverOp.path.shift(),
        };

        const result = fieldPrimitive._internal.transformOperation(clientOpForField, serverOpForField);

        if (result.type === "transformed") {
          // Restore the original path
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

/** Creates a new StructPrimitive with the given fields */
export const Struct = <TFields extends Record<string, AnyPrimitive>>(
  fields: TFields
): StructPrimitive<TFields> =>
  new StructPrimitive({ required: false, defaultValue: undefined, fields });

// =============================================================================
// Boolean Primitive
// =============================================================================

export interface BooleanProxy {
  /** Gets the current boolean value */
  get(): boolean | undefined;
  /** Sets the boolean value, generating a boolean.set operation */
  set(value: boolean): void;
}

interface BooleanPrimitiveSchema {
  readonly required: boolean;
  readonly defaultValue: boolean | undefined;
}

export class BooleanPrimitive implements Primitive<boolean, BooleanProxy> {
  readonly _tag = "BooleanPrimitive" as const;
  readonly _State!: boolean;
  readonly _Proxy!: BooleanProxy;

  private readonly _schema: BooleanPrimitiveSchema;

  private readonly _opDefinitions = {
    set: OperationDefinition.make({
      kind: "boolean.set" as const,
      payload: Schema.Boolean,
      target: Schema.Boolean,
      apply: (payload) => payload,
    }),
  };

  constructor(schema: BooleanPrimitiveSchema) {
    this._schema = schema;
  }

  /** Mark this boolean as required */
  required(): BooleanPrimitive {
    return new BooleanPrimitive({
      ...this._schema,
      required: true,
    });
  }

  /** Set a default value for this boolean */
  default(defaultValue: boolean): BooleanPrimitive {
    return new BooleanPrimitive({
      ...this._schema,
      defaultValue,
    });
  }

  readonly _internal: PrimitiveInternal<boolean, BooleanProxy> = {
    createProxy: (env: ProxyEnvironment.ProxyEnvironment, operationPath: OperationPath.OperationPath): BooleanProxy => {
      return {
        get: (): boolean | undefined => {
          return env.getState(operationPath) as boolean | undefined;
        },
        set: (value: boolean) => {
          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.set, value)
          );
        },
      };
    },

    applyOperation: (state: boolean | undefined, operation: Operation.Operation<any, any, any>): boolean => {
      if (operation.kind !== "boolean.set") {
        throw new ValidationError(`BooleanPrimitive cannot apply operation of kind: ${operation.kind}`);
      }

      const payload = operation.payload;
      if (typeof payload !== "boolean") {
        throw new ValidationError(`BooleanPrimitive.set requires a boolean payload, got: ${typeof payload}`);
      }

      return payload;
    },

    getInitialState: (): boolean | undefined => {
      return this._schema.defaultValue;
    },

    transformOperation: (
      clientOp: Operation.Operation<any, any, any>,
      serverOp: Operation.Operation<any, any, any>
    ): Transform.TransformResult => {
      // If paths don't overlap, no transformation needed
      if (!OperationPath.pathsOverlap(clientOp.path, serverOp.path)) {
        return { type: "transformed", operation: clientOp };
      }

      // For same path, client wins (last-write-wins)
      return { type: "transformed", operation: clientOp };
    },
  };
}

/** Creates a new BooleanPrimitive */
export const Boolean = (): BooleanPrimitive =>
  new BooleanPrimitive({ required: false, defaultValue: undefined });

// =============================================================================
// Number Primitive
// =============================================================================

export interface NumberProxy {
  /** Gets the current number value */
  get(): number | undefined;
  /** Sets the number value, generating a number.set operation */
  set(value: number): void;
}

interface NumberPrimitiveSchema {
  readonly required: boolean;
  readonly defaultValue: number | undefined;
}

export class NumberPrimitive implements Primitive<number, NumberProxy> {
  readonly _tag = "NumberPrimitive" as const;
  readonly _State!: number;
  readonly _Proxy!: NumberProxy;

  private readonly _schema: NumberPrimitiveSchema;

  private readonly _opDefinitions = {
    set: OperationDefinition.make({
      kind: "number.set" as const,
      payload: Schema.Number,
      target: Schema.Number,
      apply: (payload) => payload,
    }),
  };

  constructor(schema: NumberPrimitiveSchema) {
    this._schema = schema;
  }

  /** Mark this number as required */
  required(): NumberPrimitive {
    return new NumberPrimitive({
      ...this._schema,
      required: true,
    });
  }

  /** Set a default value for this number */
  default(defaultValue: number): NumberPrimitive {
    return new NumberPrimitive({
      ...this._schema,
      defaultValue,
    });
  }

  readonly _internal: PrimitiveInternal<number, NumberProxy> = {
    createProxy: (env: ProxyEnvironment.ProxyEnvironment, operationPath: OperationPath.OperationPath): NumberProxy => {
      return {
        get: (): number | undefined => {
          return env.getState(operationPath) as number | undefined;
        },
        set: (value: number) => {
          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.set, value)
          );
        },
      };
    },

    applyOperation: (state: number | undefined, operation: Operation.Operation<any, any, any>): number => {
      if (operation.kind !== "number.set") {
        throw new ValidationError(`NumberPrimitive cannot apply operation of kind: ${operation.kind}`);
      }

      const payload = operation.payload;
      if (typeof payload !== "number") {
        throw new ValidationError(`NumberPrimitive.set requires a number payload, got: ${typeof payload}`);
      }

      return payload;
    },

    getInitialState: (): number | undefined => {
      return this._schema.defaultValue;
    },

    transformOperation: (
      clientOp: Operation.Operation<any, any, any>,
      serverOp: Operation.Operation<any, any, any>
    ): Transform.TransformResult => {
      // If paths don't overlap, no transformation needed
      if (!OperationPath.pathsOverlap(clientOp.path, serverOp.path)) {
        return { type: "transformed", operation: clientOp };
      }

      // For same path, client wins (last-write-wins)
      return { type: "transformed", operation: clientOp };
    },
  };
}

/** Creates a new NumberPrimitive */
export const Number = (): NumberPrimitive =>
  new NumberPrimitive({ required: false, defaultValue: undefined });

// =============================================================================
// Literal Primitive
// =============================================================================

/** Valid literal types */
export type LiteralValue = string | number | boolean | null;

export interface LiteralProxy<T extends LiteralValue> {
  /** Gets the current literal value */
  get(): T | undefined;
  /** Sets the literal value (must match the exact literal type) */
  set(value: T): void;
}

interface LiteralPrimitiveSchema<T extends LiteralValue> {
  readonly required: boolean;
  readonly defaultValue: T | undefined;
  readonly literal: T;
}

export class LiteralPrimitive<T extends LiteralValue> implements Primitive<T, LiteralProxy<T>> {
  readonly _tag = "LiteralPrimitive" as const;
  readonly _State!: T;
  readonly _Proxy!: LiteralProxy<T>;

  private readonly _schema: LiteralPrimitiveSchema<T>;

  private readonly _opDefinitions = {
    set: OperationDefinition.make({
      kind: "literal.set" as const,
      payload: Schema.Unknown,
      target: Schema.Unknown,
      apply: (payload) => payload,
    }),
  };

  constructor(schema: LiteralPrimitiveSchema<T>) {
    this._schema = schema;
  }

  /** Mark this literal as required */
  required(): LiteralPrimitive<T> {
    return new LiteralPrimitive({
      ...this._schema,
      required: true,
    });
  }

  /** Set a default value for this literal */
  default(defaultValue: T): LiteralPrimitive<T> {
    return new LiteralPrimitive({
      ...this._schema,
      defaultValue,
    });
  }

  /** Get the literal value this primitive represents */
  get literal(): T {
    return this._schema.literal;
  }

  readonly _internal: PrimitiveInternal<T, LiteralProxy<T>> = {
    createProxy: (env: ProxyEnvironment.ProxyEnvironment, operationPath: OperationPath.OperationPath): LiteralProxy<T> => {
      return {
        get: (): T | undefined => {
          return env.getState(operationPath) as T | undefined;
        },
        set: (value: T) => {
          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.set, value)
          );
        },
      };
    },

    applyOperation: (state: T | undefined, operation: Operation.Operation<any, any, any>): T => {
      if (operation.kind !== "literal.set") {
        throw new ValidationError(`LiteralPrimitive cannot apply operation of kind: ${operation.kind}`);
      }

      const payload = operation.payload;
      if (payload !== this._schema.literal) {
        throw new ValidationError(
          `LiteralPrimitive.set requires the exact literal value "${globalThis.String(this._schema.literal)}", got: "${globalThis.String(payload)}"`
        );
      }

      return payload as T;
    },

    getInitialState: (): T | undefined => {
      return this._schema.defaultValue;
    },

    transformOperation: (
      clientOp: Operation.Operation<any, any, any>,
      serverOp: Operation.Operation<any, any, any>
    ): Transform.TransformResult => {
      // If paths don't overlap, no transformation needed
      if (!OperationPath.pathsOverlap(clientOp.path, serverOp.path)) {
        return { type: "transformed", operation: clientOp };
      }

      // For same path, client wins (last-write-wins)
      return { type: "transformed", operation: clientOp };
    },
  };
}

/** Creates a new LiteralPrimitive with the given literal value */
export const Literal = <T extends LiteralValue>(literal: T): LiteralPrimitive<T> =>
  new LiteralPrimitive({ required: false, defaultValue: undefined, literal });

// =============================================================================
// Array Primitive (Ordered with ID + Fractional Index)
// =============================================================================

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

export interface ArrayProxy<TElement extends AnyPrimitive> {
  /** Gets the current array entries (sorted by position) */
  get(): ArrayState<TElement>;
  /** Replaces the entire array with new values (generates new IDs and positions) */
  set(values: readonly InferState<TElement>[]): void;
  /** Appends a value to the end of the array */
  push(value: InferState<TElement>): void;
  /** Inserts a value at the specified visual index */
  insertAt(index: number, value: InferState<TElement>): void;
  /** Removes the element with the specified ID */
  remove(id: string): void;
  /** Moves an element to a new visual index */
  move(id: string, toIndex: number): void;
  /** Returns a proxy for the element with the specified ID */
  at(id: string): InferProxy<TElement>;
  /** Finds an element by predicate and returns its proxy */
  find(predicate: (value: InferState<TElement>, id: string) => boolean): InferProxy<TElement> | undefined;
}

/** The state type for arrays - an array of entries */
export type ArrayState<TElement extends AnyPrimitive> = readonly ArrayEntry<InferState<TElement>>[];

interface ArrayPrimitiveSchema<TElement extends AnyPrimitive> {
  readonly required: boolean;
  readonly defaultValue: ArrayState<TElement> | undefined;
  readonly element: TElement;
}

export class ArrayPrimitive<TElement extends AnyPrimitive>
  implements Primitive<ArrayState<TElement>, ArrayProxy<TElement>>
{
  readonly _tag = "ArrayPrimitive" as const;
  readonly _State!: ArrayState<TElement>;
  readonly _Proxy!: ArrayProxy<TElement>;

  private readonly _schema: ArrayPrimitiveSchema<TElement>;

  private readonly _opDefinitions = {
    set: OperationDefinition.make({
      kind: "array.set" as const,
      payload: Schema.Unknown,
      target: Schema.Unknown,
      apply: (payload) => payload,
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
  required(): ArrayPrimitive<TElement> {
    return new ArrayPrimitive({
      ...this._schema,
      required: true,
    });
  }

  /** Set a default value for this array */
  default(defaultValue: ArrayState<TElement>): ArrayPrimitive<TElement> {
    return new ArrayPrimitive({
      ...this._schema,
      defaultValue,
    });
  }

  /** Get the element primitive */
  get element(): TElement {
    return this._schema.element;
  }

  readonly _internal: PrimitiveInternal<ArrayState<TElement>, ArrayProxy<TElement>> = {
    createProxy: (env: ProxyEnvironment.ProxyEnvironment, operationPath: OperationPath.OperationPath): ArrayProxy<TElement> => {
      const elementPrimitive = this._schema.element;

      // Helper to get current state (sorted)
      const getCurrentState = (): ArrayEntry<InferState<TElement>>[] => {
        const state = env.getState(operationPath) as ArrayState<TElement> | undefined;
        return state ? sortByPos(state) : [];
      };

      return {
        get: (): ArrayState<TElement> => {
          return getCurrentState();
        },

        set: (values: readonly InferState<TElement>[]) => {
          // Generate entries with new IDs and sequential positions
          const entries: ArrayEntry<InferState<TElement>>[] = [];
          let prevPos: string | null = null;
          
          for (const value of values) {
            const id = env.generateId();
            const pos = generatePosBetween(prevPos, null);
            entries.push({ id, pos, value });
            prevPos = pos;
          }
          
          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.set, entries)
          );
        },

        push: (value: InferState<TElement>) => {
          const sorted = getCurrentState();
          const lastPos = sorted.length > 0 ? sorted[sorted.length - 1]!.pos : null;
          const id = env.generateId();
          const pos = generatePosBetween(lastPos, null);
          
          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.insert, { id, pos, value })
          );
        },

        insertAt: (index: number, value: InferState<TElement>) => {
          const sorted = getCurrentState();
          const leftPos = index > 0 && sorted[index - 1] ? sorted[index - 1]!.pos : null;
          const rightPos = index < sorted.length && sorted[index] ? sorted[index]!.pos : null;
          
          const id = env.generateId();
          const pos = generatePosBetween(leftPos, rightPos);
          
          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.insert, { id, pos, value })
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
      };
    },

    applyOperation: (
      state: ArrayState<TElement> | undefined,
      operation: Operation.Operation<any, any, any>
    ): ArrayState<TElement> => {
      const path = operation.path;
      const tokens = path.toTokens().filter((t: string) => t !== "");
      const currentState = state ?? [];

      // If path is empty, this is an array-level operation
      if (tokens.length === 0) {
        switch (operation.kind) {
          case "array.set": {
            const payload = operation.payload;
            if (!globalThis.Array.isArray(payload)) {
              throw new ValidationError(`ArrayPrimitive.set requires an array payload`);
            }
            return payload as ArrayState<TElement>;
          }
          case "array.insert": {
            const { id, pos, value } = operation.payload as { id: string; pos: string; value: InferState<TElement> };
            return [...currentState, { id, pos, value }];
          }
          case "array.remove": {
            const { id } = operation.payload as { id: string };
            return currentState.filter(entry => entry.id !== id);
          }
          case "array.move": {
            const { id, pos } = operation.payload as { id: string; pos: string };
            return currentState.map(entry => 
              entry.id === id ? { ...entry, pos } : entry
            );
          }
          default:
            throw new ValidationError(`ArrayPrimitive cannot apply operation of kind: ${operation.kind}`);
        }
      }

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

      const newState = [...currentState];
      newState[entryIndex] = { ...currentEntry, value: newValue };
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
export const Array = <TElement extends AnyPrimitive>(element: TElement): ArrayPrimitive<TElement> =>
  new ArrayPrimitive({ required: false, defaultValue: undefined, element });

// =============================================================================
// Lazy Primitive
// =============================================================================

/**
 * Type to infer state from a lazy thunk
 */
export type InferLazyState<T extends () => AnyPrimitive> = InferState<ReturnType<T>>;

/**
 * Type to infer proxy from a lazy thunk
 */
export type InferLazyProxy<T extends () => AnyPrimitive> = InferProxy<ReturnType<T>>;

export class LazyPrimitive<TThunk extends () => AnyPrimitive>
  implements Primitive<InferLazyState<TThunk>, InferLazyProxy<TThunk>>
{
  readonly _tag = "LazyPrimitive" as const;
  readonly _State!: InferLazyState<TThunk>;
  readonly _Proxy!: InferLazyProxy<TThunk>;

  private readonly _thunk: TThunk;
  private _resolved: ReturnType<TThunk> | undefined;

  constructor(thunk: TThunk) {
    this._thunk = thunk;
  }

  /** Resolve and cache the lazy primitive */
  private _resolve(): ReturnType<TThunk> {
    if (this._resolved === undefined) {
      this._resolved = this._thunk() as ReturnType<TThunk>;
    }
    return this._resolved;
  }

  /** Mark this lazy primitive as required (delegates to resolved) */
  required(): LazyPrimitive<TThunk> {
    // Note: For lazy, we can't easily propagate required to the resolved primitive
    // without resolving it first. This is a limitation.
    return this;
  }

  readonly _internal: PrimitiveInternal<InferLazyState<TThunk>, InferLazyProxy<TThunk>> = {
    createProxy: (env: ProxyEnvironment.ProxyEnvironment, operationPath: OperationPath.OperationPath): InferLazyProxy<TThunk> => {
      const resolved = this._resolve();
      return resolved._internal.createProxy(env, operationPath) as InferLazyProxy<TThunk>;
    },

    applyOperation: (
      state: InferLazyState<TThunk> | undefined,
      operation: Operation.Operation<any, any, any>
    ): InferLazyState<TThunk> => {
      const resolved = this._resolve();
      return resolved._internal.applyOperation(state, operation) as InferLazyState<TThunk>;
    },

    getInitialState: (): InferLazyState<TThunk> | undefined => {
      const resolved = this._resolve();
      return resolved._internal.getInitialState() as InferLazyState<TThunk> | undefined;
    },

    transformOperation: (
      clientOp: Operation.Operation<any, any, any>,
      serverOp: Operation.Operation<any, any, any>
    ): Transform.TransformResult => {
      // Delegate to resolved primitive
      const resolved = this._resolve();
      return resolved._internal.transformOperation(clientOp, serverOp);
    },
  };
}

/** Creates a new LazyPrimitive with the given thunk */
export const Lazy = <TThunk extends () => AnyPrimitive>(thunk: TThunk): LazyPrimitive<TThunk> =>
  new LazyPrimitive(thunk);

// =============================================================================
// Union Primitive (Tagged/Discriminated)
// =============================================================================

/**
 * Type constraint for union variants - must be struct primitives
 */
export type UnionVariants = Record<string, StructPrimitive<any>>;

/**
 * Infer the union state type from variants
 */
export type InferUnionState<TVariants extends UnionVariants> = {
  [K in keyof TVariants]: InferState<TVariants[K]>;
}[keyof TVariants];

/**
 * Proxy for accessing union variants
 */
export interface UnionProxy<TVariants extends UnionVariants, TDiscriminator extends string> {
  /** Gets the current union value */
  get(): InferUnionState<TVariants> | undefined;
  
  /** Sets the entire union value */
  set(value: InferUnionState<TVariants>): void;
  
  /** Access a specific variant's proxy (assumes the variant is active) */
  as<K extends keyof TVariants>(variant: K): InferProxy<TVariants[K]>;
  
  /** Pattern match on the variant type */
  match<R>(handlers: {
    [K in keyof TVariants]: (proxy: InferProxy<TVariants[K]>) => R;
  }): R | undefined;
}

interface UnionPrimitiveSchema<TVariants extends UnionVariants, TDiscriminator extends string> {
  readonly required: boolean;
  readonly defaultValue: InferUnionState<TVariants> | undefined;
  readonly discriminator: TDiscriminator;
  readonly variants: TVariants;
}

export class UnionPrimitive<TVariants extends UnionVariants, TDiscriminator extends string = "type">
  implements Primitive<InferUnionState<TVariants>, UnionProxy<TVariants, TDiscriminator>>
{
  readonly _tag = "UnionPrimitive" as const;
  readonly _State!: InferUnionState<TVariants>;
  readonly _Proxy!: UnionProxy<TVariants, TDiscriminator>;

  private readonly _schema: UnionPrimitiveSchema<TVariants, TDiscriminator>;

  private readonly _opDefinitions = {
    set: OperationDefinition.make({
      kind: "union.set" as const,
      payload: Schema.Unknown,
      target: Schema.Unknown,
      apply: (payload) => payload,
    }),
  };

  constructor(schema: UnionPrimitiveSchema<TVariants, TDiscriminator>) {
    this._schema = schema;
  }

  /** Mark this union as required */
  required(): UnionPrimitive<TVariants, TDiscriminator> {
    return new UnionPrimitive({
      ...this._schema,
      required: true,
    });
  }

  /** Set a default value for this union */
  default(defaultValue: InferUnionState<TVariants>): UnionPrimitive<TVariants, TDiscriminator> {
    return new UnionPrimitive({
      ...this._schema,
      defaultValue,
    });
  }

  /** Get the discriminator field name */
  get discriminator(): TDiscriminator {
    return this._schema.discriminator;
  }

  /** Get the variants */
  get variants(): TVariants {
    return this._schema.variants;
  }

  /** Find the variant key from a state value */
  private _findVariantKey(state: InferUnionState<TVariants>): keyof TVariants | undefined {
    if (typeof state !== "object" || state === null) {
      return undefined;
    }
    const discriminatorValue = (state as Record<string, unknown>)[this._schema.discriminator];
    
    // Find the variant that matches this discriminator value
    for (const key in this._schema.variants) {
      const variant = this._schema.variants[key]!;
      const discriminatorField = variant.fields[this._schema.discriminator];
      if (discriminatorField && discriminatorField._tag === "LiteralPrimitive") {
        const literalPrimitive = discriminatorField as LiteralPrimitive<any>;
        if (literalPrimitive.literal === discriminatorValue) {
          return key;
        }
      }
    }
    return undefined;
  }

  readonly _internal: PrimitiveInternal<InferUnionState<TVariants>, UnionProxy<TVariants, TDiscriminator>> = {
    createProxy: (
      env: ProxyEnvironment.ProxyEnvironment,
      operationPath: OperationPath.OperationPath
    ): UnionProxy<TVariants, TDiscriminator> => {
      const variants = this._schema.variants;

      return {
        get: (): InferUnionState<TVariants> | undefined => {
          return env.getState(operationPath) as InferUnionState<TVariants> | undefined;
        },
        set: (value: InferUnionState<TVariants>) => {
          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.set, value)
          );
        },
        as: <K extends keyof TVariants>(variant: K): InferProxy<TVariants[K]> => {
          const variantPrimitive = variants[variant];
          if (!variantPrimitive) {
            throw new ValidationError(`Unknown variant: ${globalThis.String(variant)}`);
          }
          return variantPrimitive._internal.createProxy(env, operationPath) as InferProxy<TVariants[K]>;
        },
        match: <R,>(handlers: { [K in keyof TVariants]: (proxy: InferProxy<TVariants[K]>) => R }): R | undefined => {
          const state = env.getState(operationPath) as InferUnionState<TVariants> | undefined;
          if (!state) return undefined;
          
          const variantKey = this._findVariantKey(state);
          if (!variantKey) return undefined;
          
          const handler = handlers[variantKey];
          if (!handler) return undefined;
          
          const variantProxy = variants[variantKey]!._internal.createProxy(env, operationPath) as InferProxy<TVariants[typeof variantKey]>;
          return handler(variantProxy);
        },
      };
    },

    applyOperation: (
      state: InferUnionState<TVariants> | undefined,
      operation: Operation.Operation<any, any, any>
    ): InferUnionState<TVariants> => {
      const path = operation.path;
      const tokens = path.toTokens().filter((t: string) => t !== "");

      // If path is empty, this is a union-level operation
      if (tokens.length === 0) {
        if (operation.kind !== "union.set") {
          throw new ValidationError(`UnionPrimitive root cannot apply operation of kind: ${operation.kind}`);
        }

        const payload = operation.payload;
        if (typeof payload !== "object" || payload === null) {
          throw new ValidationError(`UnionPrimitive.set requires an object payload`);
        }

        // Validate that the discriminator field exists and matches a variant
        const discriminatorValue = (payload as Record<string, unknown>)[this._schema.discriminator];
        if (discriminatorValue === undefined) {
          throw new ValidationError(`UnionPrimitive.set requires a "${this._schema.discriminator}" discriminator field`);
        }

        return payload as InferUnionState<TVariants>;
      }

      // Otherwise, delegate to the active variant
      // We need to determine which variant is active based on current state
      if (state === undefined) {
        throw new ValidationError(`Cannot apply nested operation to undefined union state`);
      }

      const variantKey = this._findVariantKey(state);
      if (variantKey === undefined) {
        throw new ValidationError(`Cannot determine active variant from state`);
      }

      const variantPrimitive = this._schema.variants[variantKey]!;
      const newState = variantPrimitive._internal.applyOperation(
        state as InferState<typeof variantPrimitive>,
        operation
      );

      return newState as InferUnionState<TVariants>;
    },

    getInitialState: (): InferUnionState<TVariants> | undefined => {
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

      const clientTokens = clientPath.toTokens().filter((t: string) => t !== "");
      const serverTokens = serverPath.toTokens().filter((t: string) => t !== "");

      // If both are at root level (union.set operations)
      if (clientTokens.length === 0 && serverTokens.length === 0) {
        // Client wins (last-write-wins)
        return { type: "transformed", operation: clientOp };
      }

      // If server set entire union and client is updating a field
      if (serverTokens.length === 0 && serverOp.kind === "union.set") {
        // Client's field operation proceeds - optimistic update
        // Server will validate/reject if needed
        return { type: "transformed", operation: clientOp };
      }

      // If client set entire union and server is updating a field
      if (clientTokens.length === 0 && clientOp.kind === "union.set") {
        // Client's union.set supersedes server's field update
        return { type: "transformed", operation: clientOp };
      }

      // Both operations target fields within the union
      // Since union variants are struct primitives, delegate to the first variant
      // that matches (they all should have the same field structure for the overlapping field)
      if (clientTokens.length > 0 && serverTokens.length > 0) {
        const clientField = clientTokens[0];
        const serverField = serverTokens[0];

        // Different fields - no conflict
        if (clientField !== serverField) {
          return { type: "transformed", operation: clientOp };
        }

        // Same field - delegate to a variant (use first variant as they share structure)
        const variantKeys = Object.keys(this._schema.variants);
        if (variantKeys.length === 0) {
          return { type: "transformed", operation: clientOp };
        }

        const firstVariant = this._schema.variants[variantKeys[0]!]!;
        const result = firstVariant._internal.transformOperation(clientOp, serverOp);

        return result;
      }

      // Default: no transformation needed
      return { type: "transformed", operation: clientOp };
    },
  };
}

/** Options for creating a Union primitive */
export interface UnionOptions<TVariants extends UnionVariants, TDiscriminator extends string> {
  /** The field name used to discriminate between variants (defaults to "type") */
  readonly discriminator?: TDiscriminator;
  /** The variant struct primitives */
  readonly variants: TVariants;
}

/** Creates a new UnionPrimitive with the given variants */
export function Union<TVariants extends UnionVariants>(
  options: UnionOptions<TVariants, "type">
): UnionPrimitive<TVariants, "type">;
export function Union<TVariants extends UnionVariants, TDiscriminator extends string>(
  options: UnionOptions<TVariants, TDiscriminator>
): UnionPrimitive<TVariants, TDiscriminator>;
export function Union<TVariants extends UnionVariants, TDiscriminator extends string = "type">(
  options: UnionOptions<TVariants, TDiscriminator>
): UnionPrimitive<TVariants, TDiscriminator> {
  const discriminator = (options.discriminator ?? "type") as TDiscriminator;
  return new UnionPrimitive({
    required: false,
    defaultValue: undefined,
    discriminator,
    variants: options.variants,
  });
}
