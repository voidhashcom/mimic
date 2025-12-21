import { Schema } from "effect";
import * as OperationDefinition from "../OperationDefinition";
import * as Operation from "../Operation";
import * as OperationPath from "../OperationPath";
import * as ProxyEnvironment from "../ProxyEnvironment";
import * as Transform from "../Transform";
import type { Primitive, PrimitiveInternal, MaybeUndefined, AnyPrimitive, Validator, InferState, InferProxy, InferSnapshot } from "../Primitive";
import { ValidationError } from "../Primitive";
import { runValidators } from "./shared";


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
  readonly validators: readonly Validator<InferStructState<TFields>>[];
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

  /** Add a custom validation rule (useful for cross-field validation) */
  refine(fn: (value: InferStructState<TFields>) => boolean, message: string): StructPrimitive<TFields, TDefined> {
    return new StructPrimitive({
      ...this._schema,
      validators: [...this._schema.validators, { validate: fn, message }],
    });
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

      let newState: InferStructState<TFields>;

      // If path is empty or root, this is a struct.set operation
      if (tokens.length === 0) {
        if (operation.kind !== "struct.set") {
          throw new ValidationError(`StructPrimitive root cannot apply operation of kind: ${operation.kind}`);
        }

        const payload = operation.payload;
        if (typeof payload !== "object" || payload === null) {
          throw new ValidationError(`StructPrimitive.set requires an object payload`);
        }

        newState = payload as InferStructState<TFields>;
      } else {
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

        // Build updated state
        newState = {
          ...currentState,
          [fieldName]: newFieldState,
        };
      }

      // Run validators on the new state
      runValidators(newState, this._schema.validators);

      return newState;
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
  new StructPrimitive({ required: false, defaultValue: undefined, fields, validators: [] });

