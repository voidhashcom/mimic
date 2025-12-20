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

/**
 * Helper type to conditionally add undefined based on TDefined.
 * When TDefined is true, the value is guaranteed to be defined (via required() or default()).
 * When TDefined is false, the value may be undefined.
 */
export type MaybeUndefined<T, TDefined extends boolean> = TDefined extends true ? T : T | undefined;

/**
 * Infer the snapshot type from a primitive.
 * The snapshot is a readonly, type-safe structure suitable for rendering.
 */
export type InferSnapshot<T> = T extends Primitive<any, infer P>
  ? P extends { toSnapshot(): infer S } ? S : never
  : never;

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

export interface StringProxy<TDefined extends boolean = false> {
  /** Gets the current string value */
  get(): MaybeUndefined<string, TDefined>;
  /** Sets the string value, generating a string.set operation */
  set(value: string): void;
  /** Returns a readonly snapshot of the string value for rendering */
  toSnapshot(): MaybeUndefined<string, TDefined>;
}

interface StringPrimitiveSchema {
  readonly required: boolean;
  readonly defaultValue: string | undefined;
}

export class StringPrimitive<TDefined extends boolean = false> implements Primitive<string, StringProxy<TDefined>> {
  readonly _tag = "StringPrimitive" as const;
  readonly _State!: string;
  readonly _Proxy!: StringProxy<TDefined>;

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
  required(): StringPrimitive<true> {
    return new StringPrimitive({
      ...this._schema,
      required: true,
    });
  }

  /** Set a default value for this string */
  default(defaultValue: string): StringPrimitive<true> {
    return new StringPrimitive({
      ...this._schema,
      defaultValue,
    });
  }

  readonly _internal: PrimitiveInternal<string, StringProxy<TDefined>> = {
    createProxy: (env: ProxyEnvironment.ProxyEnvironment, operationPath: OperationPath.OperationPath): StringProxy<TDefined> => {
      const defaultValue = this._schema.defaultValue;
      return {
        get: (): MaybeUndefined<string, TDefined> => {
          const state = env.getState(operationPath) as string | undefined;
          return (state ?? defaultValue) as MaybeUndefined<string, TDefined>;
        },
        set: (value: string) => {
          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.set, value)
          );
        },
        toSnapshot: (): MaybeUndefined<string, TDefined> => {
          const state = env.getState(operationPath) as string | undefined;
          return (state ?? defaultValue) as MaybeUndefined<string, TDefined>;
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
export const String = (): StringPrimitive<false> =>
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
 * Maps a schema definition to its snapshot type.
 * Each field's snapshot type is inferred from the field primitive.
 */
export type InferStructSnapshot<TFields extends Record<string, AnyPrimitive>> = {
  readonly [K in keyof TFields]: InferSnapshot<TFields[K]>;
};

/**
 * Maps a schema definition to its proxy type.
 * Provides nested field access + get()/set()/toSnapshot() methods for the whole struct.
 */
export type StructProxy<TFields extends Record<string, AnyPrimitive>, TDefined extends boolean = false> = {
  readonly [K in keyof TFields]: InferProxy<TFields[K]>;
} & {
  /** Gets the entire struct value */
  get(): MaybeUndefined<InferStructState<TFields>, TDefined>;
  /** Sets the entire struct value */
  set(value: InferStructState<TFields>): void;
  /** Returns a readonly snapshot of the struct for rendering */
  toSnapshot(): MaybeUndefined<InferStructSnapshot<TFields>, TDefined>;
};

interface StructPrimitiveSchema<TFields extends Record<string, AnyPrimitive>> {
  readonly required: boolean;
  readonly defaultValue: InferStructState<TFields> | undefined;
  readonly fields: TFields;
}

export class StructPrimitive<TFields extends Record<string, AnyPrimitive>, TDefined extends boolean = false>
  implements Primitive<InferStructState<TFields>, StructProxy<TFields, TDefined>>
{
  readonly _tag = "StructPrimitive" as const;
  readonly _State!: InferStructState<TFields>;
  readonly _Proxy!: StructProxy<TFields, TDefined>;

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
  required(): StructPrimitive<TFields, true> {
    return new StructPrimitive({
      ...this._schema,
      required: true,
    });
  }

  /** Set a default value for this struct */
  default(defaultValue: InferStructState<TFields>): StructPrimitive<TFields, true> {
    return new StructPrimitive({
      ...this._schema,
      defaultValue,
    });
  }

  /** Get the fields schema */
  get fields(): TFields {
    return this._schema.fields;
  }

  readonly _internal: PrimitiveInternal<InferStructState<TFields>, StructProxy<TFields, TDefined>> = {
    createProxy: (env: ProxyEnvironment.ProxyEnvironment, operationPath: OperationPath.OperationPath): StructProxy<TFields, TDefined> => {
      const fields = this._schema.fields;
      const defaultValue = this._schema.defaultValue;

      // Helper to build a snapshot by calling toSnapshot on each field
      const buildSnapshot = (): InferStructSnapshot<TFields> | undefined => {
        const state = env.getState(operationPath);
        
        // Build snapshot from field proxies (they handle their own defaults)
        const snapshot: Record<string, unknown> = {};
        let hasAnyDefinedField = false;
        
        for (const key in fields) {
          const fieldPrimitive = fields[key]!;
          const fieldPath = operationPath.append(key);
          const fieldProxy = fieldPrimitive._internal.createProxy(env, fieldPath);
          const fieldSnapshot = (fieldProxy as { toSnapshot(): unknown }).toSnapshot();
          snapshot[key] = fieldSnapshot;
          if (fieldSnapshot !== undefined) {
            hasAnyDefinedField = true;
          }
        }
        
        // Return undefined only if there's no state, no struct default, and no field snapshots
        if (state === undefined && defaultValue === undefined && !hasAnyDefinedField) {
          return undefined;
        }
        
        return snapshot as InferStructSnapshot<TFields>;
      };

      // Create the base object with get/set/toSnapshot methods
      const base = {
        get: (): MaybeUndefined<InferStructState<TFields>, TDefined> => {
          const state = env.getState(operationPath) as InferStructState<TFields> | undefined;
          return (state ?? defaultValue) as MaybeUndefined<InferStructState<TFields>, TDefined>;
        },
        set: (value: InferStructState<TFields>) => {
          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.set, value)
          );
        },
        toSnapshot: (): MaybeUndefined<InferStructSnapshot<TFields>, TDefined> => {
          const snapshot = buildSnapshot();
          return snapshot as MaybeUndefined<InferStructSnapshot<TFields>, TDefined>;
        },
      };

      // Use a JavaScript Proxy to intercept field access
      return new globalThis.Proxy(base as StructProxy<TFields, TDefined>, {
        get: (target, prop, receiver) => {
          // Return base methods (get, set, toSnapshot)
          if (prop === "get") {
            return target.get;
          }
          if (prop === "set") {
            return target.set;
          }
          if (prop === "toSnapshot") {
            return target.toSnapshot;
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
          if (prop === "get" || prop === "set" || prop === "toSnapshot") return true;
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
): StructPrimitive<TFields, false> =>
  new StructPrimitive({ required: false, defaultValue: undefined, fields });

// =============================================================================
// Boolean Primitive
// =============================================================================

export interface BooleanProxy<TDefined extends boolean = false> {
  /** Gets the current boolean value */
  get(): MaybeUndefined<boolean, TDefined>;
  /** Sets the boolean value, generating a boolean.set operation */
  set(value: boolean): void;
  /** Returns a readonly snapshot of the boolean value for rendering */
  toSnapshot(): MaybeUndefined<boolean, TDefined>;
}

interface BooleanPrimitiveSchema {
  readonly required: boolean;
  readonly defaultValue: boolean | undefined;
}

export class BooleanPrimitive<TDefined extends boolean = false> implements Primitive<boolean, BooleanProxy<TDefined>> {
  readonly _tag = "BooleanPrimitive" as const;
  readonly _State!: boolean;
  readonly _Proxy!: BooleanProxy<TDefined>;

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
  required(): BooleanPrimitive<true> {
    return new BooleanPrimitive({
      ...this._schema,
      required: true,
    });
  }

  /** Set a default value for this boolean */
  default(defaultValue: boolean): BooleanPrimitive<true> {
    return new BooleanPrimitive({
      ...this._schema,
      defaultValue,
    });
  }

  readonly _internal: PrimitiveInternal<boolean, BooleanProxy<TDefined>> = {
    createProxy: (env: ProxyEnvironment.ProxyEnvironment, operationPath: OperationPath.OperationPath): BooleanProxy<TDefined> => {
      const defaultValue = this._schema.defaultValue;
      return {
        get: (): MaybeUndefined<boolean, TDefined> => {
          const state = env.getState(operationPath) as boolean | undefined;
          return (state ?? defaultValue) as MaybeUndefined<boolean, TDefined>;
        },
        set: (value: boolean) => {
          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.set, value)
          );
        },
        toSnapshot: (): MaybeUndefined<boolean, TDefined> => {
          const state = env.getState(operationPath) as boolean | undefined;
          return (state ?? defaultValue) as MaybeUndefined<boolean, TDefined>;
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
export const Boolean = (): BooleanPrimitive<false> =>
  new BooleanPrimitive({ required: false, defaultValue: undefined });

// =============================================================================
// Number Primitive
// =============================================================================

export interface NumberProxy<TDefined extends boolean = false> {
  /** Gets the current number value */
  get(): MaybeUndefined<number, TDefined>;
  /** Sets the number value, generating a number.set operation */
  set(value: number): void;
  /** Returns a readonly snapshot of the number value for rendering */
  toSnapshot(): MaybeUndefined<number, TDefined>;
}

interface NumberPrimitiveSchema {
  readonly required: boolean;
  readonly defaultValue: number | undefined;
}

export class NumberPrimitive<TDefined extends boolean = false> implements Primitive<number, NumberProxy<TDefined>> {
  readonly _tag = "NumberPrimitive" as const;
  readonly _State!: number;
  readonly _Proxy!: NumberProxy<TDefined>;

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
  required(): NumberPrimitive<true> {
    return new NumberPrimitive({
      ...this._schema,
      required: true,
    });
  }

  /** Set a default value for this number */
  default(defaultValue: number): NumberPrimitive<true> {
    return new NumberPrimitive({
      ...this._schema,
      defaultValue,
    });
  }

  readonly _internal: PrimitiveInternal<number, NumberProxy<TDefined>> = {
    createProxy: (env: ProxyEnvironment.ProxyEnvironment, operationPath: OperationPath.OperationPath): NumberProxy<TDefined> => {
      const defaultValue = this._schema.defaultValue;
      return {
        get: (): MaybeUndefined<number, TDefined> => {
          const state = env.getState(operationPath) as number | undefined;
          return (state ?? defaultValue) as MaybeUndefined<number, TDefined>;
        },
        set: (value: number) => {
          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.set, value)
          );
        },
        toSnapshot: (): MaybeUndefined<number, TDefined> => {
          const state = env.getState(operationPath) as number | undefined;
          return (state ?? defaultValue) as MaybeUndefined<number, TDefined>;
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
export const Number = (): NumberPrimitive<false> =>
  new NumberPrimitive({ required: false, defaultValue: undefined });

// =============================================================================
// Literal Primitive
// =============================================================================

/** Valid literal types */
export type LiteralValue = string | number | boolean | null;

export interface LiteralProxy<T extends LiteralValue, TDefined extends boolean = false> {
  /** Gets the current literal value */
  get(): MaybeUndefined<T, TDefined>;
  /** Sets the literal value (must match the exact literal type) */
  set(value: T): void;
  /** Returns a readonly snapshot of the literal value for rendering */
  toSnapshot(): MaybeUndefined<T, TDefined>;
}

interface LiteralPrimitiveSchema<T extends LiteralValue> {
  readonly required: boolean;
  readonly defaultValue: T | undefined;
  readonly literal: T;
}

export class LiteralPrimitive<T extends LiteralValue, TDefined extends boolean = false> implements Primitive<T, LiteralProxy<T, TDefined>> {
  readonly _tag = "LiteralPrimitive" as const;
  readonly _State!: T;
  readonly _Proxy!: LiteralProxy<T, TDefined>;

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
  required(): LiteralPrimitive<T, true> {
    return new LiteralPrimitive({
      ...this._schema,
      required: true,
    });
  }

  /** Set a default value for this literal */
  default(defaultValue: T): LiteralPrimitive<T, true> {
    return new LiteralPrimitive({
      ...this._schema,
      defaultValue,
    });
  }

  /** Get the literal value this primitive represents */
  get literal(): T {
    return this._schema.literal;
  }

  readonly _internal: PrimitiveInternal<T, LiteralProxy<T, TDefined>> = {
    createProxy: (env: ProxyEnvironment.ProxyEnvironment, operationPath: OperationPath.OperationPath): LiteralProxy<T, TDefined> => {
      const defaultValue = this._schema.defaultValue;
      return {
        get: (): MaybeUndefined<T, TDefined> => {
          const state = env.getState(operationPath) as T | undefined;
          return (state ?? defaultValue) as MaybeUndefined<T, TDefined>;
        },
        set: (value: T) => {
          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.set, value)
          );
        },
        toSnapshot: (): MaybeUndefined<T, TDefined> => {
          const state = env.getState(operationPath) as T | undefined;
          return (state ?? defaultValue) as MaybeUndefined<T, TDefined>;
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
export const Literal = <T extends LiteralValue>(literal: T): LiteralPrimitive<T, false> =>
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
  /** Returns a readonly snapshot of the array for rendering (always returns an array, never undefined) */
  toSnapshot(): ArraySnapshot<TElement>;
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

/**
 * Type to infer snapshot from a lazy thunk
 */
export type InferLazySnapshot<T extends () => AnyPrimitive> = InferSnapshot<ReturnType<T>>;

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
export type UnionVariants = Record<string, StructPrimitive<any, any>>;

/**
 * Infer the union state type from variants
 */
export type InferUnionState<TVariants extends UnionVariants> = {
  [K in keyof TVariants]: InferState<TVariants[K]>;
}[keyof TVariants];

/**
 * Infer the union snapshot type from variants
 */
export type InferUnionSnapshot<TVariants extends UnionVariants> = {
  [K in keyof TVariants]: InferSnapshot<TVariants[K]>;
}[keyof TVariants];

/**
 * Proxy for accessing union variants
 */
export interface UnionProxy<TVariants extends UnionVariants, TDiscriminator extends string, TDefined extends boolean = false> {
  /** Gets the current union value */
  get(): MaybeUndefined<InferUnionState<TVariants>, TDefined>;
  
  /** Sets the entire union value */
  set(value: InferUnionState<TVariants>): void;
  
  /** Access a specific variant's proxy (assumes the variant is active) */
  as<K extends keyof TVariants>(variant: K): InferProxy<TVariants[K]>;
  
  /** Pattern match on the variant type */
  match<R>(handlers: {
    [K in keyof TVariants]: (proxy: InferProxy<TVariants[K]>) => R;
  }): R | undefined;
  
  /** Returns a readonly snapshot of the union for rendering */
  toSnapshot(): MaybeUndefined<InferUnionSnapshot<TVariants>, TDefined>;
}

interface UnionPrimitiveSchema<TVariants extends UnionVariants, TDiscriminator extends string> {
  readonly required: boolean;
  readonly defaultValue: InferUnionState<TVariants> | undefined;
  readonly discriminator: TDiscriminator;
  readonly variants: TVariants;
}

export class UnionPrimitive<TVariants extends UnionVariants, TDiscriminator extends string = "type", TDefined extends boolean = false>
  implements Primitive<InferUnionState<TVariants>, UnionProxy<TVariants, TDiscriminator, TDefined>>
{
  readonly _tag = "UnionPrimitive" as const;
  readonly _State!: InferUnionState<TVariants>;
  readonly _Proxy!: UnionProxy<TVariants, TDiscriminator, TDefined>;

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
  required(): UnionPrimitive<TVariants, TDiscriminator, true> {
    return new UnionPrimitive({
      ...this._schema,
      required: true,
    });
  }

  /** Set a default value for this union */
  default(defaultValue: InferUnionState<TVariants>): UnionPrimitive<TVariants, TDiscriminator, true> {
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
        const literalPrimitive = discriminatorField as LiteralPrimitive<any, any>;
        if (literalPrimitive.literal === discriminatorValue) {
          return key;
        }
      }
    }
    return undefined;
  }

  readonly _internal: PrimitiveInternal<InferUnionState<TVariants>, UnionProxy<TVariants, TDiscriminator, TDefined>> = {
    createProxy: (
      env: ProxyEnvironment.ProxyEnvironment,
      operationPath: OperationPath.OperationPath
    ): UnionProxy<TVariants, TDiscriminator, TDefined> => {
      const variants = this._schema.variants;
      const defaultValue = this._schema.defaultValue;

      return {
        get: (): MaybeUndefined<InferUnionState<TVariants>, TDefined> => {
          const state = env.getState(operationPath) as InferUnionState<TVariants> | undefined;
          return (state ?? defaultValue) as MaybeUndefined<InferUnionState<TVariants>, TDefined>;
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
        toSnapshot: (): MaybeUndefined<InferUnionSnapshot<TVariants>, TDefined> => {
          const state = env.getState(operationPath) as InferUnionState<TVariants> | undefined;
          const effectiveState = state ?? defaultValue;
          if (!effectiveState) {
            return undefined as MaybeUndefined<InferUnionSnapshot<TVariants>, TDefined>;
          }
          
          const variantKey = this._findVariantKey(effectiveState);
          if (!variantKey) {
            return undefined as MaybeUndefined<InferUnionSnapshot<TVariants>, TDefined>;
          }
          
          const variantPrimitive = variants[variantKey]!;
          const variantProxy = variantPrimitive._internal.createProxy(env, operationPath);
          return (variantProxy as unknown as { toSnapshot(): InferUnionSnapshot<TVariants> }).toSnapshot() as MaybeUndefined<InferUnionSnapshot<TVariants>, TDefined>;
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
): UnionPrimitive<TVariants, "type", false>;
export function Union<TVariants extends UnionVariants, TDiscriminator extends string>(
  options: UnionOptions<TVariants, TDiscriminator>
): UnionPrimitive<TVariants, TDiscriminator, false>;
export function Union<TVariants extends UnionVariants, TDiscriminator extends string = "type">(
  options: UnionOptions<TVariants, TDiscriminator>
): UnionPrimitive<TVariants, TDiscriminator, false> {
  const discriminator = (options.discriminator ?? "type") as TDiscriminator;
  return new UnionPrimitive({
    required: false,
    defaultValue: undefined,
    discriminator,
    variants: options.variants,
  });
}

// =============================================================================
// TreeNode Primitive
// =============================================================================

/**
 * Any TreeNodePrimitive type - used for generic constraints.
 */
export type AnyTreeNodePrimitive = TreeNodePrimitive<string, StructPrimitive<any>, readonly AnyTreeNodePrimitive[] | (() => readonly AnyTreeNodePrimitive[])>;

/**
 * Resolves children type - handles both array and lazy thunk
 */
export type ResolveChildren<TChildren extends readonly AnyTreeNodePrimitive[] | (() => readonly AnyTreeNodePrimitive[])> =
  TChildren extends () => readonly AnyTreeNodePrimitive[] ? ReturnType<TChildren> : TChildren;

/**
 * Infer the data state type from a TreeNodePrimitive
 */
export type InferTreeNodeDataState<T extends AnyTreeNodePrimitive> = 
  T extends TreeNodePrimitive<any, infer TData, any> ? InferState<TData> : never;

/**
 * Infer the type literal from a TreeNodePrimitive
 */
export type InferTreeNodeType<T extends AnyTreeNodePrimitive> =
  T extends TreeNodePrimitive<infer TType, any, any> ? TType : never;

/**
 * Infer the allowed children from a TreeNodePrimitive
 */
export type InferTreeNodeChildren<T extends AnyTreeNodePrimitive> =
  T extends TreeNodePrimitive<any, any, infer TChildren> ? ResolveChildren<TChildren>[number] : never;

/**
 * Configuration for a TreeNode primitive
 */
export interface TreeNodeConfig<
  TData extends StructPrimitive<any>,
  TChildren extends readonly AnyTreeNodePrimitive[] | (() => readonly AnyTreeNodePrimitive[])
> {
  readonly data: TData;
  readonly children: TChildren;
}

/**
 * TreeNodePrimitive - defines a node type with its data schema and allowed children
 */
export class TreeNodePrimitive<
  TType extends string,
  TData extends StructPrimitive<any>,
  TChildren extends readonly AnyTreeNodePrimitive[] | (() => readonly AnyTreeNodePrimitive[])
> {
  readonly _tag = "TreeNodePrimitive" as const;
  readonly _Type!: TType;
  readonly _Data!: TData;
  readonly _Children!: TChildren;

  private readonly _type: TType;
  private readonly _data: TData;
  private readonly _children: TChildren;
  private _resolvedChildren: readonly AnyTreeNodePrimitive[] | undefined;

  constructor(type: TType, config: TreeNodeConfig<TData, TChildren>) {
    this._type = type;
    this._data = config.data;
    this._children = config.children;
  }

  /** Get the node type identifier */
  get type(): TType {
    return this._type;
  }

  /** Get the data primitive */
  get data(): TData {
    return this._data;
  }

  /** Get resolved children (resolves lazy thunk if needed) */
  get children(): ResolveChildren<TChildren> {
    if (this._resolvedChildren === undefined) {
      if (typeof this._children === "function") {
        this._resolvedChildren = (this._children as () => readonly AnyTreeNodePrimitive[])();
      } else {
        this._resolvedChildren = this._children as readonly AnyTreeNodePrimitive[];
      }
    }
    return this._resolvedChildren as ResolveChildren<TChildren>;
  }

  /** Check if a child type is allowed */
  isChildAllowed(childType: string): boolean {
    return this.children.some(child => child.type === childType);
  }
}

/** Creates a new TreeNodePrimitive with the given type and config */
export const TreeNode = <
  TType extends string,
  TData extends StructPrimitive<any>,
  TChildren extends readonly AnyTreeNodePrimitive[] | (() => readonly AnyTreeNodePrimitive[])
>(
  type: TType,
  config: TreeNodeConfig<TData, TChildren>
): TreeNodePrimitive<TType, TData, TChildren> =>
  new TreeNodePrimitive(type, config);

// =============================================================================
// Tree Primitive (Ordered Tree with Parent References)
// =============================================================================

/**
 * A node in the tree state (flat storage format)
 */
export interface TreeNodeState {
  readonly id: string;              // Unique node identifier (UUID)
  readonly type: string;            // Node type discriminator
  readonly parentId: string | null; // Parent node ID (null for root)
  readonly pos: string;             // Fractional index for sibling ordering
  readonly data: unknown;           // Node-specific data
}

/**
 * Typed node state for a specific node type
 */
export interface TypedTreeNodeState<TNode extends AnyTreeNodePrimitive> {
  readonly id: string;
  readonly type: InferTreeNodeType<TNode>;
  readonly parentId: string | null;
  readonly pos: string;
  readonly data: InferTreeNodeDataState<TNode>;
}

/**
 * The state type for trees - a flat array of nodes
 */
export type TreeState<TRoot extends AnyTreeNodePrimitive> = readonly TreeNodeState[];

/**
 * Helper to get children sorted by position
 */
const getOrderedChildren = (
  nodes: readonly TreeNodeState[],
  parentId: string | null
): TreeNodeState[] => {
  return [...nodes]
    .filter(n => n.parentId === parentId)
    .sort((a, b) => a.pos < b.pos ? -1 : a.pos > b.pos ? 1 : 0);
};

/**
 * Get all descendant IDs of a node (recursive)
 */
const getDescendantIds = (
  nodes: readonly TreeNodeState[],
  nodeId: string
): string[] => {
  const children = nodes.filter(n => n.parentId === nodeId);
  const descendantIds: string[] = [];
  for (const child of children) {
    descendantIds.push(child.id);
    descendantIds.push(...getDescendantIds(nodes, child.id));
  }
  return descendantIds;
};

/**
 * Check if moving a node to a new parent would create a cycle
 */
const wouldCreateCycle = (
  nodes: readonly TreeNodeState[],
  nodeId: string,
  newParentId: string | null
): boolean => {
  if (newParentId === null) return false;
  if (newParentId === nodeId) return true;
  
  const descendants = getDescendantIds(nodes, nodeId);
  return descendants.includes(newParentId);
};

/**
 * Generate a fractional position between two positions
 */
const generateTreePosBetween = (left: string | null, right: string | null): string => {
  const charSet = FractionalIndex.base62CharSet();
  return Effect.runSync(FractionalIndex.generateKeyBetween(left, right, charSet));
};

/**
 * Snapshot of a single node for UI rendering (data properties spread at node level)
 */
export type TreeNodeSnapshot<TNode extends AnyTreeNodePrimitive> = {
  readonly id: string;
  readonly type: InferTreeNodeType<TNode>;
  readonly children: TreeNodeSnapshot<InferTreeNodeChildren<TNode>>[];
} & InferTreeNodeDataState<TNode>;

/**
 * Infer the snapshot type for a tree (recursive tree structure for UI)
 */
export type InferTreeSnapshot<T extends TreePrimitive<any>> =
  T extends TreePrimitive<infer TRoot> ? TreeNodeSnapshot<TRoot> : never;

/**
 * Typed proxy for a specific node type - provides type-safe data access
 */
export interface TypedNodeProxy<TNode extends AnyTreeNodePrimitive> {
  /** The node ID */
  readonly id: string;
  /** The node type */
  readonly type: InferTreeNodeType<TNode>;
  /** Access the node's data proxy */
  readonly data: InferProxy<TNode["data"]>;
  /** Get the raw node state */
  get(): TypedTreeNodeState<TNode>;
}

/**
 * Node proxy with type narrowing capabilities
 */
export interface TreeNodeProxyBase<TRoot extends AnyTreeNodePrimitive> {
  /** The node ID */
  readonly id: string;
  /** The node type (string) */
  readonly type: string;
  /** Type guard - narrows the proxy to a specific node type */
  is<TNode extends AnyTreeNodePrimitive>(
    nodeType: TNode
  ): this is TypedNodeProxy<TNode>;
  /** Type assertion - returns typed proxy (throws if wrong type) */
  as<TNode extends AnyTreeNodePrimitive>(
    nodeType: TNode
  ): TypedNodeProxy<TNode>;
  /** Get the raw node state */
  get(): TreeNodeState;
}

/**
 * Proxy for accessing and modifying tree nodes
 */
export interface TreeProxy<TRoot extends AnyTreeNodePrimitive> {
  /** Gets the entire tree state (flat array of nodes) */
  get(): TreeState<TRoot>;
  
  /** Replaces the entire tree */
  set(nodes: TreeState<TRoot>): void;
  
  /** Gets the root node state */
  root(): TypedTreeNodeState<TRoot> | undefined;
  
  /** Gets ordered children states of a parent (null for root's children) */
  children(parentId: string | null): TreeNodeState[];
  
  /** Gets a node proxy by ID with type narrowing capabilities */
  node(id: string): TreeNodeProxyBase<TRoot> | undefined;
  
  /** Insert a new node as the first child */
  insertFirst<TNode extends AnyTreeNodePrimitive>(
    parentId: string | null,
    nodeType: TNode,
    data: InferTreeNodeDataState<TNode>
  ): string;
  
  /** Insert a new node as the last child */
  insertLast<TNode extends AnyTreeNodePrimitive>(
    parentId: string | null,
    nodeType: TNode,
    data: InferTreeNodeDataState<TNode>
  ): string;
  
  /** Insert a new node at a specific index among siblings */
  insertAt<TNode extends AnyTreeNodePrimitive>(
    parentId: string | null,
    index: number,
    nodeType: TNode,
    data: InferTreeNodeDataState<TNode>
  ): string;
  
  /** Insert a new node after a sibling */
  insertAfter<TNode extends AnyTreeNodePrimitive>(
    siblingId: string,
    nodeType: TNode,
    data: InferTreeNodeDataState<TNode>
  ): string;
  
  /** Insert a new node before a sibling */
  insertBefore<TNode extends AnyTreeNodePrimitive>(
    siblingId: string,
    nodeType: TNode,
    data: InferTreeNodeDataState<TNode>
  ): string;
  
  /** Remove a node and all its descendants */
  remove(id: string): void;
  
  /** Move a node to a new parent at a specific index */
  move(nodeId: string, newParentId: string | null, toIndex: number): void;
  
  /** Move a node after a sibling */
  moveAfter(nodeId: string, siblingId: string): void;
  
  /** Move a node before a sibling */
  moveBefore(nodeId: string, siblingId: string): void;
  
  /** Move a node to be the first child of a parent */
  moveToFirst(nodeId: string, newParentId: string | null): void;
  
  /** Move a node to be the last child of a parent */
  moveToLast(nodeId: string, newParentId: string | null): void;
  
  /** Returns a typed proxy for a specific node's data */
  at<TNode extends AnyTreeNodePrimitive>(
    id: string,
    nodeType: TNode
  ): InferProxy<TNode["data"]>;
  
  /** Convert tree to a nested snapshot for UI rendering */
  toSnapshot(): TreeNodeSnapshot<TRoot> | undefined;
}

interface TreePrimitiveSchema<TRoot extends AnyTreeNodePrimitive> {
  readonly required: boolean;
  readonly defaultValue: TreeState<TRoot> | undefined;
  readonly root: TRoot;
}

export class TreePrimitive<TRoot extends AnyTreeNodePrimitive>
  implements Primitive<TreeState<TRoot>, TreeProxy<TRoot>>
{
  readonly _tag = "TreePrimitive" as const;
  readonly _State!: TreeState<TRoot>;
  readonly _Proxy!: TreeProxy<TRoot>;

  private readonly _schema: TreePrimitiveSchema<TRoot>;
  private _nodeTypeRegistry: Map<string, AnyTreeNodePrimitive> | undefined;

  private readonly _opDefinitions = {
    set: OperationDefinition.make({
      kind: "tree.set" as const,
      payload: Schema.Unknown,
      target: Schema.Unknown,
      apply: (payload) => payload,
    }),
    insert: OperationDefinition.make({
      kind: "tree.insert" as const,
      payload: Schema.Unknown,
      target: Schema.Unknown,
      apply: (payload) => payload,
    }),
    remove: OperationDefinition.make({
      kind: "tree.remove" as const,
      payload: Schema.Unknown,
      target: Schema.Unknown,
      apply: (payload) => payload,
    }),
    move: OperationDefinition.make({
      kind: "tree.move" as const,
      payload: Schema.Unknown,
      target: Schema.Unknown,
      apply: (payload) => payload,
    }),
  };

  constructor(schema: TreePrimitiveSchema<TRoot>) {
    this._schema = schema;
  }

  /** Mark this tree as required */
  required(): TreePrimitive<TRoot> {
    return new TreePrimitive({
      ...this._schema,
      required: true,
    });
  }

  /** Set a default value for this tree */
  default(defaultValue: TreeState<TRoot>): TreePrimitive<TRoot> {
    return new TreePrimitive({
      ...this._schema,
      defaultValue,
    });
  }

  /** Get the root node type */
  get root(): TRoot {
    return this._schema.root;
  }

  /**
   * Build a registry of all node types reachable from root
   */
  private _buildNodeTypeRegistry(): Map<string, AnyTreeNodePrimitive> {
    if (this._nodeTypeRegistry !== undefined) {
      return this._nodeTypeRegistry;
    }

    const registry = new Map<string, AnyTreeNodePrimitive>();
    const visited = new Set<string>();

    const visit = (node: AnyTreeNodePrimitive) => {
      if (visited.has(node.type)) return;
      visited.add(node.type);
      registry.set(node.type, node);

      for (const child of node.children) {
        visit(child);
      }
    };

    visit(this._schema.root);
    this._nodeTypeRegistry = registry;
    return registry;
  }

  /**
   * Get a node type primitive by its type string
   */
  private _getNodeTypePrimitive(type: string): AnyTreeNodePrimitive {
    const registry = this._buildNodeTypeRegistry();
    const nodeType = registry.get(type);
    if (!nodeType) {
      throw new ValidationError(`Unknown node type: ${type}`);
    }
    return nodeType;
  }

  /**
   * Validate that a node type can be a child of a parent node type
   */
  private _validateChildType(
    parentType: string | null,
    childType: string
  ): void {
    if (parentType === null) {
      // Root level - child must be the root type
      if (childType !== this._schema.root.type) {
        throw new ValidationError(
          `Root node must be of type "${this._schema.root.type}", got "${childType}"`
        );
      }
      return;
    }

    const parentNodePrimitive = this._getNodeTypePrimitive(parentType);
    if (!parentNodePrimitive.isChildAllowed(childType)) {
      const allowedTypes = parentNodePrimitive.children.map(c => c.type).join(", ");
      throw new ValidationError(
        `Node type "${childType}" is not allowed as a child of "${parentType}". ` +
        `Allowed types: ${allowedTypes || "none"}`
      );
    }
  }

  readonly _internal: PrimitiveInternal<TreeState<TRoot>, TreeProxy<TRoot>> = {
    createProxy: (
      env: ProxyEnvironment.ProxyEnvironment,
      operationPath: OperationPath.OperationPath
    ): TreeProxy<TRoot> => {
      // Helper to get current state
      const getCurrentState = (): TreeState<TRoot> => {
        const state = env.getState(operationPath) as TreeState<TRoot> | undefined;
        return state ?? [];
      };

      // Helper to get parent type from state
      const getParentType = (parentId: string | null): string | null => {
        if (parentId === null) return null;
        const state = getCurrentState();
        const parent = state.find(n => n.id === parentId);
        return parent?.type ?? null;
      };

      // Helper to create a node proxy with type narrowing
      const createNodeProxy = (nodeState: TreeNodeState): TreeNodeProxyBase<TRoot> => {
        return {
          id: nodeState.id,
          type: nodeState.type,
          
          is: <TNode extends AnyTreeNodePrimitive>(
            nodeType: TNode
          ): boolean => {
            return nodeState.type === nodeType.type;
          },
          
          as: <TNode extends AnyTreeNodePrimitive>(
            nodeType: TNode
          ): TypedNodeProxy<TNode> => {
            if (nodeState.type !== nodeType.type) {
              throw new ValidationError(
                `Node is of type "${nodeState.type}", not "${nodeType.type}"`
              );
            }
            const nodePath = operationPath.append(nodeState.id);
            return {
              id: nodeState.id,
              type: nodeType.type as InferTreeNodeType<TNode>,
              data: nodeType.data._internal.createProxy(env, nodePath) as InferProxy<TNode["data"]>,
              get: () => nodeState as TypedTreeNodeState<TNode>,
            };
          },
          
          get: () => nodeState,
        } as TreeNodeProxyBase<TRoot>;
      };

      // Helper to build recursive snapshot
      const buildSnapshot = (
        nodeId: string,
        nodes: readonly TreeNodeState[]
      ): TreeNodeSnapshot<TRoot> | undefined => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return undefined;

        const childNodes = getOrderedChildren(nodes, nodeId);
        const children: TreeNodeSnapshot<any>[] = [];
        for (const child of childNodes) {
          const childSnapshot = buildSnapshot(child.id, nodes);
          if (childSnapshot) {
            children.push(childSnapshot);
          }
        }

        // Spread data properties at node level
        return {
          id: node.id,
          type: node.type,
          ...(node.data as object),
          children,
        } as unknown as TreeNodeSnapshot<TRoot>;
      };

      return {
        get: (): TreeState<TRoot> => {
          return getCurrentState();
        },

        set: (nodes: TreeState<TRoot>) => {
          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.set, nodes)
          );
        },

        root: (): TypedTreeNodeState<TRoot> | undefined => {
          const state = getCurrentState();
          const rootNode = state.find(n => n.parentId === null);
          return rootNode as TypedTreeNodeState<TRoot> | undefined;
        },

        children: (parentId: string | null): TreeNodeState[] => {
          const state = getCurrentState();
          return getOrderedChildren(state, parentId);
        },

        node: (id: string): TreeNodeProxyBase<TRoot> | undefined => {
          const state = getCurrentState();
          const nodeState = state.find(n => n.id === id);
          if (!nodeState) return undefined;
          return createNodeProxy(nodeState);
        },

        insertFirst: <TNode extends AnyTreeNodePrimitive>(
          parentId: string | null,
          nodeType: TNode,
          data: InferTreeNodeDataState<TNode>
        ): string => {
          const state = getCurrentState();
          const siblings = getOrderedChildren(state, parentId);
          const firstPos = siblings.length > 0 ? siblings[0]!.pos : null;
          const pos = generateTreePosBetween(null, firstPos);
          const id = env.generateId();

          // Validate parent exists (if not root)
          if (parentId !== null && !state.find(n => n.id === parentId)) {
            throw new ValidationError(`Parent node not found: ${parentId}`);
          }

          // Validate child type is allowed
          const parentType = getParentType(parentId);
          this._validateChildType(parentType, nodeType.type);

          // Validate single root
          if (parentId === null && state.some(n => n.parentId === null)) {
            throw new ValidationError("Tree already has a root node");
          }

          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.insert, {
              id,
              type: nodeType.type,
              parentId,
              pos,
              data,
            })
          );

          return id;
        },

        insertLast: <TNode extends AnyTreeNodePrimitive>(
          parentId: string | null,
          nodeType: TNode,
          data: InferTreeNodeDataState<TNode>
        ): string => {
          const state = getCurrentState();
          const siblings = getOrderedChildren(state, parentId);
          const lastPos = siblings.length > 0 ? siblings[siblings.length - 1]!.pos : null;
          const pos = generateTreePosBetween(lastPos, null);
          const id = env.generateId();

          // Validate parent exists (if not root)
          if (parentId !== null && !state.find(n => n.id === parentId)) {
            throw new ValidationError(`Parent node not found: ${parentId}`);
          }

          // Validate child type is allowed
          const parentType = getParentType(parentId);
          this._validateChildType(parentType, nodeType.type);

          // Validate single root
          if (parentId === null && state.some(n => n.parentId === null)) {
            throw new ValidationError("Tree already has a root node");
          }

          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.insert, {
              id,
              type: nodeType.type,
              parentId,
              pos,
              data,
            })
          );

          return id;
        },

        insertAt: <TNode extends AnyTreeNodePrimitive>(
          parentId: string | null,
          index: number,
          nodeType: TNode,
          data: InferTreeNodeDataState<TNode>
        ): string => {
          const state = getCurrentState();
          const siblings = getOrderedChildren(state, parentId);
          const clampedIndex = Math.max(0, Math.min(index, siblings.length));
          const leftPos = clampedIndex > 0 && siblings[clampedIndex - 1] ? siblings[clampedIndex - 1]!.pos : null;
          const rightPos = clampedIndex < siblings.length && siblings[clampedIndex] ? siblings[clampedIndex]!.pos : null;
          const pos = generateTreePosBetween(leftPos, rightPos);
          const id = env.generateId();

          // Validate parent exists (if not root)
          if (parentId !== null && !state.find(n => n.id === parentId)) {
            throw new ValidationError(`Parent node not found: ${parentId}`);
          }

          // Validate child type is allowed
          const parentType = getParentType(parentId);
          this._validateChildType(parentType, nodeType.type);

          // Validate single root
          if (parentId === null && state.some(n => n.parentId === null)) {
            throw new ValidationError("Tree already has a root node");
          }

          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.insert, {
              id,
              type: nodeType.type,
              parentId,
              pos,
              data,
            })
          );

          return id;
        },

        insertAfter: <TNode extends AnyTreeNodePrimitive>(
          siblingId: string,
          nodeType: TNode,
          data: InferTreeNodeDataState<TNode>
        ): string => {
          const state = getCurrentState();
          const sibling = state.find(n => n.id === siblingId);
          if (!sibling) {
            throw new ValidationError(`Sibling node not found: ${siblingId}`);
          }

          const parentId = sibling.parentId;
          const siblings = getOrderedChildren(state, parentId);
          const siblingIndex = siblings.findIndex(n => n.id === siblingId);
          const nextSibling = siblings[siblingIndex + 1];
          const pos = generateTreePosBetween(sibling.pos, nextSibling?.pos ?? null);
          const id = env.generateId();

          // Validate child type is allowed
          const parentType = getParentType(parentId);
          this._validateChildType(parentType, nodeType.type);

          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.insert, {
              id,
              type: nodeType.type,
              parentId,
              pos,
              data,
            })
          );

          return id;
        },

        insertBefore: <TNode extends AnyTreeNodePrimitive>(
          siblingId: string,
          nodeType: TNode,
          data: InferTreeNodeDataState<TNode>
        ): string => {
          const state = getCurrentState();
          const sibling = state.find(n => n.id === siblingId);
          if (!sibling) {
            throw new ValidationError(`Sibling node not found: ${siblingId}`);
          }

          const parentId = sibling.parentId;
          const siblings = getOrderedChildren(state, parentId);
          const siblingIndex = siblings.findIndex(n => n.id === siblingId);
          const prevSibling = siblings[siblingIndex - 1];
          const pos = generateTreePosBetween(prevSibling?.pos ?? null, sibling.pos);
          const id = env.generateId();

          // Validate child type is allowed
          const parentType = getParentType(parentId);
          this._validateChildType(parentType, nodeType.type);

          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.insert, {
              id,
              type: nodeType.type,
              parentId,
              pos,
              data,
            })
          );

          return id;
        },

        remove: (id: string) => {
          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.remove, { id })
          );
        },

        move: (nodeId: string, newParentId: string | null, toIndex: number) => {
          const state = getCurrentState();
          const node = state.find(n => n.id === nodeId);
          if (!node) {
            throw new ValidationError(`Node not found: ${nodeId}`);
          }

          // Validate parent exists (if not moving to root)
          if (newParentId !== null && !state.find(n => n.id === newParentId)) {
            throw new ValidationError(`Parent node not found: ${newParentId}`);
          }

          // Validate no cycle
          if (wouldCreateCycle(state, nodeId, newParentId)) {
            throw new ValidationError("Move would create a cycle in the tree");
          }

          // Validate child type is allowed in new parent
          const newParentType = newParentId === null ? null : state.find(n => n.id === newParentId)?.type ?? null;
          this._validateChildType(newParentType, node.type);

          // Validate not moving root to a parent
          if (node.parentId === null && newParentId !== null) {
            throw new ValidationError("Cannot move root node to have a parent");
          }

          // Calculate new position among new siblings (excluding self)
          const siblings = getOrderedChildren(state, newParentId).filter(n => n.id !== nodeId);
          const clampedIndex = Math.max(0, Math.min(toIndex, siblings.length));
          const leftPos = clampedIndex > 0 && siblings[clampedIndex - 1] ? siblings[clampedIndex - 1]!.pos : null;
          const rightPos = clampedIndex < siblings.length && siblings[clampedIndex] ? siblings[clampedIndex]!.pos : null;
          const pos = generateTreePosBetween(leftPos, rightPos);

          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.move, {
              id: nodeId,
              parentId: newParentId,
              pos,
            })
          );
        },

        moveAfter: (nodeId: string, siblingId: string) => {
          const state = getCurrentState();
          const node = state.find(n => n.id === nodeId);
          const sibling = state.find(n => n.id === siblingId);
          
          if (!node) {
            throw new ValidationError(`Node not found: ${nodeId}`);
          }
          if (!sibling) {
            throw new ValidationError(`Sibling node not found: ${siblingId}`);
          }

          const newParentId = sibling.parentId;

          // Validate no cycle
          if (wouldCreateCycle(state, nodeId, newParentId)) {
            throw new ValidationError("Move would create a cycle in the tree");
          }

          // Validate child type is allowed in new parent
          const newParentType = newParentId === null ? null : state.find(n => n.id === newParentId)?.type ?? null;
          this._validateChildType(newParentType, node.type);

          // Validate not moving root to a parent
          if (node.parentId === null && newParentId !== null) {
            throw new ValidationError("Cannot move root node to have a parent");
          }

          const siblings = getOrderedChildren(state, newParentId).filter(n => n.id !== nodeId);
          const siblingIndex = siblings.findIndex(n => n.id === siblingId);
          const nextSibling = siblings[siblingIndex + 1];
          const pos = generateTreePosBetween(sibling.pos, nextSibling?.pos ?? null);

          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.move, {
              id: nodeId,
              parentId: newParentId,
              pos,
            })
          );
        },

        moveBefore: (nodeId: string, siblingId: string) => {
          const state = getCurrentState();
          const node = state.find(n => n.id === nodeId);
          const sibling = state.find(n => n.id === siblingId);
          
          if (!node) {
            throw new ValidationError(`Node not found: ${nodeId}`);
          }
          if (!sibling) {
            throw new ValidationError(`Sibling node not found: ${siblingId}`);
          }

          const newParentId = sibling.parentId;

          // Validate no cycle
          if (wouldCreateCycle(state, nodeId, newParentId)) {
            throw new ValidationError("Move would create a cycle in the tree");
          }

          // Validate child type is allowed in new parent
          const newParentType = newParentId === null ? null : state.find(n => n.id === newParentId)?.type ?? null;
          this._validateChildType(newParentType, node.type);

          // Validate not moving root to a parent
          if (node.parentId === null && newParentId !== null) {
            throw new ValidationError("Cannot move root node to have a parent");
          }

          const siblings = getOrderedChildren(state, newParentId).filter(n => n.id !== nodeId);
          const siblingIndex = siblings.findIndex(n => n.id === siblingId);
          const prevSibling = siblings[siblingIndex - 1];
          const pos = generateTreePosBetween(prevSibling?.pos ?? null, sibling.pos);

          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.move, {
              id: nodeId,
              parentId: newParentId,
              pos,
            })
          );
        },

        moveToFirst: (nodeId: string, newParentId: string | null) => {
          const state = getCurrentState();
          const node = state.find(n => n.id === nodeId);
          
          if (!node) {
            throw new ValidationError(`Node not found: ${nodeId}`);
          }

          // Validate parent exists (if not moving to root)
          if (newParentId !== null && !state.find(n => n.id === newParentId)) {
            throw new ValidationError(`Parent node not found: ${newParentId}`);
          }

          // Validate no cycle
          if (wouldCreateCycle(state, nodeId, newParentId)) {
            throw new ValidationError("Move would create a cycle in the tree");
          }

          // Validate child type is allowed in new parent
          const newParentType = newParentId === null ? null : state.find(n => n.id === newParentId)?.type ?? null;
          this._validateChildType(newParentType, node.type);

          // Validate not moving root to a parent
          if (node.parentId === null && newParentId !== null) {
            throw new ValidationError("Cannot move root node to have a parent");
          }

          const siblings = getOrderedChildren(state, newParentId).filter(n => n.id !== nodeId);
          const firstPos = siblings.length > 0 ? siblings[0]!.pos : null;
          const pos = generateTreePosBetween(null, firstPos);

          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.move, {
              id: nodeId,
              parentId: newParentId,
              pos,
            })
          );
        },

        moveToLast: (nodeId: string, newParentId: string | null) => {
          const state = getCurrentState();
          const node = state.find(n => n.id === nodeId);
          
          if (!node) {
            throw new ValidationError(`Node not found: ${nodeId}`);
          }

          // Validate parent exists (if not moving to root)
          if (newParentId !== null && !state.find(n => n.id === newParentId)) {
            throw new ValidationError(`Parent node not found: ${newParentId}`);
          }

          // Validate no cycle
          if (wouldCreateCycle(state, nodeId, newParentId)) {
            throw new ValidationError("Move would create a cycle in the tree");
          }

          // Validate child type is allowed in new parent
          const newParentType = newParentId === null ? null : state.find(n => n.id === newParentId)?.type ?? null;
          this._validateChildType(newParentType, node.type);

          // Validate not moving root to a parent
          if (node.parentId === null && newParentId !== null) {
            throw new ValidationError("Cannot move root node to have a parent");
          }

          const siblings = getOrderedChildren(state, newParentId).filter(n => n.id !== nodeId);
          const lastPos = siblings.length > 0 ? siblings[siblings.length - 1]!.pos : null;
          const pos = generateTreePosBetween(lastPos, null);

          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.move, {
              id: nodeId,
              parentId: newParentId,
              pos,
            })
          );
        },

        at: <TNode extends AnyTreeNodePrimitive>(
          id: string,
          nodeType: TNode
        ): InferProxy<TNode["data"]> => {
          // Get the node to verify its type
          const state = getCurrentState();
          const node = state.find(n => n.id === id);
          if (!node) {
            throw new ValidationError(`Node not found: ${id}`);
          }
          if (node.type !== nodeType.type) {
            throw new ValidationError(
              `Node is of type "${node.type}", not "${nodeType.type}"`
            );
          }

          const nodePath = operationPath.append(id);
          return nodeType.data._internal.createProxy(env, nodePath) as InferProxy<TNode["data"]>;
        },

        toSnapshot: (): TreeNodeSnapshot<TRoot> | undefined => {
          const state = getCurrentState();
          const rootNode = state.find(n => n.parentId === null);
          if (!rootNode) return undefined;
          return buildSnapshot(rootNode.id, state);
        },
      };
    },

    applyOperation: (
      state: TreeState<TRoot> | undefined,
      operation: Operation.Operation<any, any, any>
    ): TreeState<TRoot> => {
      const path = operation.path;
      const tokens = path.toTokens().filter((t: string) => t !== "");
      const currentState = state ?? [];

      // If path is empty, this is a tree-level operation
      if (tokens.length === 0) {
        switch (operation.kind) {
          case "tree.set": {
            const payload = operation.payload;
            if (!globalThis.Array.isArray(payload)) {
              throw new ValidationError(`TreePrimitive.set requires an array payload`);
            }
            return payload as TreeState<TRoot>;
          }
          case "tree.insert": {
            const { id, type, parentId, pos, data } = operation.payload as {
              id: string;
              type: string;
              parentId: string | null;
              pos: string;
              data: unknown;
            };
            return [...currentState, { id, type, parentId, pos, data }] as TreeState<TRoot>;
          }
          case "tree.remove": {
            const { id } = operation.payload as { id: string };
            // Get all descendants to remove
            const descendantIds = getDescendantIds(currentState, id);
            const idsToRemove = new Set([id, ...descendantIds]);
            return currentState.filter(node => !idsToRemove.has(node.id));
          }
          case "tree.move": {
            const { id, parentId, pos } = operation.payload as {
              id: string;
              parentId: string | null;
              pos: string;
            };
            return currentState.map(node =>
              node.id === id ? { ...node, parentId, pos } : node
            ) as TreeState<TRoot>;
          }
          default:
            throw new ValidationError(`TreePrimitive cannot apply operation of kind: ${operation.kind}`);
        }
      }

      // Otherwise, delegate to the node's data primitive
      const nodeId = tokens[0]!;
      const nodeIndex = currentState.findIndex(node => node.id === nodeId);
      
      if (nodeIndex === -1) {
        throw new ValidationError(`Tree node not found with ID: ${nodeId}`);
      }

      const node = currentState[nodeIndex]!;
      const nodeTypePrimitive = this._getNodeTypePrimitive(node.type);
      const remainingPath = path.shift();
      const nodeOperation = {
        ...operation,
        path: remainingPath,
      };

      const newData = nodeTypePrimitive.data._internal.applyOperation(
        node.data as InferStructState<any> | undefined,
        nodeOperation
      );

      const newState = [...currentState];
      newState[nodeIndex] = { ...node, data: newData };
      return newState as TreeState<TRoot>;
    },

    getInitialState: (): TreeState<TRoot> | undefined => {
      if (this._schema.defaultValue !== undefined) {
        return this._schema.defaultValue;
      }

      // Automatically create a root node with default data
      const rootNodeType = this._schema.root;
      const rootData = rootNodeType.data._internal.getInitialState() ?? {};
      const rootId = crypto.randomUUID();
      const rootPos = generateTreePosBetween(null, null);

      return [{
        id: rootId,
        type: rootNodeType.type,
        parentId: null,
        pos: rootPos,
        data: rootData,
      }] as TreeState<TRoot>;
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

      // Handle tree.remove from server - check if client is operating on removed node or descendants
      if (serverOp.kind === "tree.remove") {
        const removedId = (serverOp.payload as { id: string }).id;
        const clientTokens = clientPath.toTokens().filter((t: string) => t !== "");
        const serverTokens = serverPath.toTokens().filter((t: string) => t !== "");

        // Check if client operation targets the removed node or uses it
        if (clientOp.kind === "tree.move") {
          const movePayload = clientOp.payload as { id: string; parentId: string | null };
          // If moving the removed node or moving to a removed parent
          if (movePayload.id === removedId || movePayload.parentId === removedId) {
            return { type: "noop" };
          }
        }

        if (clientOp.kind === "tree.insert") {
          const insertPayload = clientOp.payload as { parentId: string | null };
          // If inserting into a removed parent
          if (insertPayload.parentId === removedId) {
            return { type: "noop" };
          }
        }

        // Check if client is operating on a node that was removed
        if (clientTokens.length > serverTokens.length) {
          const nodeId = clientTokens[serverTokens.length];
          if (nodeId === removedId) {
            return { type: "noop" };
          }
        }
      }

      // Both inserting - no conflict (fractional indexing handles order)
      if (serverOp.kind === "tree.insert" && clientOp.kind === "tree.insert") {
        return { type: "transformed", operation: clientOp };
      }

      // Both moving same node - client wins
      if (serverOp.kind === "tree.move" && clientOp.kind === "tree.move") {
        const serverMoveId = (serverOp.payload as { id: string }).id;
        const clientMoveId = (clientOp.payload as { id: string }).id;

        if (serverMoveId === clientMoveId) {
          return { type: "transformed", operation: clientOp };
        }
        // Different nodes - no conflict
        return { type: "transformed", operation: clientOp };
      }

      // For same exact path: client wins (last-write-wins)
      if (OperationPath.pathsEqual(clientPath, serverPath)) {
        return { type: "transformed", operation: clientOp };
      }

      // If server set entire tree and client is operating on a node
      if (serverOp.kind === "tree.set" && OperationPath.isPrefix(serverPath, clientPath)) {
        return { type: "transformed", operation: clientOp };
      }

      // Delegate to node data primitive for nested operations
      const clientTokens = clientPath.toTokens().filter((t: string) => t !== "");
      const serverTokens = serverPath.toTokens().filter((t: string) => t !== "");

      // Both operations target children of this tree
      if (clientTokens.length > 0 && serverTokens.length > 0) {
        const clientNodeId = clientTokens[0];
        const serverNodeId = serverTokens[0];

        // If operating on different nodes, no conflict
        if (clientNodeId !== serverNodeId) {
          return { type: "transformed", operation: clientOp };
        }

        // Same node - would need to delegate to node's data primitive
        // For simplicity, let client win
        return { type: "transformed", operation: clientOp };
      }

      // Default: no transformation needed
      return { type: "transformed", operation: clientOp };
    },
  };
}

/** Options for creating a Tree primitive */
export interface TreeOptions<TRoot extends AnyTreeNodePrimitive> {
  /** The root node type */
  readonly root: TRoot;
}

/** Creates a new TreePrimitive with the given root node type */
export const Tree = <TRoot extends AnyTreeNodePrimitive>(
  options: TreeOptions<TRoot>
): TreePrimitive<TRoot> =>
  new TreePrimitive({
    required: false,
    defaultValue: undefined,
    root: options.root,
  });
