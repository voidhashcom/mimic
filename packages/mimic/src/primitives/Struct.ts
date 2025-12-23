import { Schema } from "effect";
import * as OperationDefinition from "../OperationDefinition";
import * as Operation from "../Operation";
import * as OperationPath from "../OperationPath";
import * as ProxyEnvironment from "../ProxyEnvironment";
import * as Transform from "../Transform";
import type { Primitive, PrimitiveInternal, MaybeUndefined, AnyPrimitive, Validator, InferState, InferProxy, InferSnapshot, NeedsValue, InferUpdateInput, InferSetInput } from "../Primitive";
import { ValidationError } from "../Primitive";
import { runValidators, applyDefaults } from "./shared";

// =============================================================================
// Struct Set Input Types
// =============================================================================

/**
 * Determines if a field is required for set() operations.
 * A field is required if: TRequired is true AND THasDefault is false
 */
type IsRequiredForSet<T> = T extends Primitive<any, any, true, false> ? true : false;

/**
 * Extract keys of fields that are required for set() (required without default).
 */
type RequiredSetKeys<TFields extends Record<string, AnyPrimitive>> = {
  [K in keyof TFields]: IsRequiredForSet<TFields[K]> extends true ? K : never;
}[keyof TFields];

/**
 * Extract keys of fields that are optional for set() (has default OR not required).
 */
type OptionalSetKeys<TFields extends Record<string, AnyPrimitive>> = {
  [K in keyof TFields]: IsRequiredForSet<TFields[K]> extends true ? never : K;
}[keyof TFields];

/**
 * Compute the input type for set() operations on a struct.
 * Required fields (required without default) must be provided.
 * Optional fields (has default or not required) can be omitted.
 * Uses each field's TSetInput type to handle nested structs correctly.
 */
export type StructSetInput<TFields extends Record<string, AnyPrimitive>> = 
  { readonly [K in RequiredSetKeys<TFields>]: InferSetInput<TFields[K]> } &
  { readonly [K in OptionalSetKeys<TFields>]?: InferSetInput<TFields[K]> };

/**
 * Input type for set() - respects required/default status of the struct.
 * If the struct is required without a default, the value must be provided.
 * The value itself uses StructSetInput which handles field-level required/default logic.
 */
type InferStructSetInput<TFields extends Record<string, AnyPrimitive>, TRequired extends boolean, THasDefault extends boolean> = 
  NeedsValue<StructSetInput<TFields>, TRequired, THasDefault>;

/**
 * Input type for update() - always partial since update only modifies specified fields.
 * For nested structs, allows recursive partial updates.
 */
type InferStructUpdateInput<TFields extends Record<string, AnyPrimitive>> = StructUpdateValue<TFields>;


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
 * Maps a schema definition to a partial update type.
 * Uses each field's TUpdateInput type, which handles nested updates recursively.
 */
export type StructUpdateValue<TFields extends Record<string, AnyPrimitive>> = {
  readonly [K in keyof TFields]?: InferUpdateInput<TFields[K]>;
};

/**
 * Maps a schema definition to its proxy type.
 * Provides nested field access + get()/set()/toSnapshot() methods for the whole struct.
 */
export type StructProxy<TFields extends Record<string, AnyPrimitive>, TRequired extends boolean = false, THasDefault extends boolean = false> = {
  readonly [K in keyof TFields]: InferProxy<TFields[K]>;
} & {
  /** Gets the entire struct value */
  get(): MaybeUndefined<InferStructState<TFields>, TRequired, THasDefault>;
  /** Sets the entire struct value (only fields that are required without defaults must be provided) */
  set(value: InferStructSetInput<TFields, TRequired, THasDefault>): void;
  /** Updates only the specified fields (partial update, handles nested structs recursively) */
  update(value: InferStructUpdateInput<TFields>): void;
  /** Returns a readonly snapshot of the struct for rendering */
  toSnapshot(): MaybeUndefined<InferStructSnapshot<TFields>, TRequired, THasDefault>;
};

interface StructPrimitiveSchema<TFields extends Record<string, AnyPrimitive>> {
  readonly required: boolean;
  readonly defaultValue: InferStructState<TFields> | undefined;
  readonly fields: TFields;
  readonly validators: readonly Validator<InferStructState<TFields>>[];
}

export class StructPrimitive<TFields extends Record<string, AnyPrimitive>, TRequired extends boolean = false, THasDefault extends boolean = false>
  implements Primitive<InferStructState<TFields>, StructProxy<TFields, TRequired, THasDefault>, TRequired, THasDefault, InferStructSetInput<TFields, TRequired, THasDefault>, InferStructUpdateInput<TFields>>
{
  readonly _tag = "StructPrimitive" as const;
  readonly _State!: InferStructState<TFields>;
  readonly _Proxy!: StructProxy<TFields, TRequired, THasDefault>;
  readonly _TRequired!: TRequired;
  readonly _THasDefault!: THasDefault;
  readonly TSetInput!: InferStructSetInput<TFields, TRequired, THasDefault>;
  readonly TUpdateInput!: InferStructUpdateInput<TFields>;

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
  required(): StructPrimitive<TFields, true, THasDefault> {
    return new StructPrimitive({
      ...this._schema,
      required: true,
    });
  }

  /** Set a default value for this struct */
  default(defaultValue: StructSetInput<TFields>): StructPrimitive<TFields, TRequired, true> {
    // Apply defaults to the provided value
    const merged = applyDefaults(this as AnyPrimitive, defaultValue as Partial<InferStructState<TFields>>) as InferStructState<TFields>;
    return new StructPrimitive({
      ...this._schema,
      defaultValue: merged,
    });
  }

  /** Get the fields schema */
  get fields(): TFields {
    return this._schema.fields;
  }

  /** Add a custom validation rule (useful for cross-field validation) */
  refine(fn: (value: InferStructState<TFields>) => boolean, message: string): StructPrimitive<TFields, TRequired, THasDefault> {
    return new StructPrimitive({
      ...this._schema,
      validators: [...this._schema.validators, { validate: fn, message }],
    });
  }

  readonly _internal: PrimitiveInternal<InferStructState<TFields>, StructProxy<TFields, TRequired, THasDefault>> = {
    createProxy: (env: ProxyEnvironment.ProxyEnvironment, operationPath: OperationPath.OperationPath): StructProxy<TFields, TRequired, THasDefault> => {
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

      // Create the base object with get/set/update/toSnapshot methods
      const base = {
        get: (): MaybeUndefined<InferStructState<TFields>, TRequired, THasDefault> => {
          const state = env.getState(operationPath) as InferStructState<TFields> | undefined;
          return (state ?? defaultValue) as MaybeUndefined<InferStructState<TFields>, TRequired, THasDefault>;
        },
        set: (value: InferStructSetInput<TFields, TRequired, THasDefault>) => {
          // Apply defaults for missing fields
          const merged = applyDefaults(this as AnyPrimitive, value as Partial<InferStructState<TFields>>) as InferStructState<TFields>;
          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.set, merged)
          );
        },
        update: (value: InferStructUpdateInput<TFields>) => {
          for (const key in value) {
            if (Object.prototype.hasOwnProperty.call(value, key)) {
              const fieldValue = value[key as keyof TFields];
              if (fieldValue === undefined) continue; // Skip undefined values

              const fieldPrimitive = fields[key as keyof TFields];
              if (!fieldPrimitive) continue; // Skip unknown fields

              const fieldPath = operationPath.append(key);
              const fieldProxy = fieldPrimitive._internal.createProxy(env, fieldPath);

              // Check if this is a nested struct and value is a plain object (partial update)
              if (
                fieldPrimitive._tag === "StructPrimitive" &&
                typeof fieldValue === "object" &&
                fieldValue !== null &&
                !Array.isArray(fieldValue)
              ) {
                // Recursively update nested struct
                (fieldProxy as { update: (v: unknown) => void }).update(fieldValue);
              } else {
                // Set the field value directly
                (fieldProxy as { set: (v: unknown) => void }).set(fieldValue);
              }
            }
          }
        },
        toSnapshot: (): MaybeUndefined<InferStructSnapshot<TFields>, TRequired, THasDefault> => {
          const snapshot = buildSnapshot();
          return snapshot as MaybeUndefined<InferStructSnapshot<TFields>, TRequired, THasDefault>;
        },
      };

      // Use a JavaScript Proxy to intercept field access
      return new globalThis.Proxy(base as StructProxy<TFields, TRequired, THasDefault>, {
        get: (target, prop, _receiver) => {
          // Return base methods (get, set, update, toSnapshot)
          if (prop === "get") {
            return target.get;
          }
          if (prop === "set") {
            return target.set;
          }
          if (prop === "update") {
            return target.update;
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
        has: (_target, prop) => {
          if (prop === "get" || prop === "set" || prop === "update" || prop === "toSnapshot") return true;
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
): StructPrimitive<TFields, false, false> =>
  new StructPrimitive({ required: false, defaultValue: undefined, fields, validators: [] });

