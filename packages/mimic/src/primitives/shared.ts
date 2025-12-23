import * as Operation from "../Operation";
import * as OperationDefinition from "../OperationDefinition";
import * as ProxyEnvironment from "../ProxyEnvironment";
import * as OperationPath from "../OperationPath";
import * as Transform from "../Transform";

// =============================================================================
// Primitive Interface & Type Utilities
// =============================================================================

/**
 * Base interface that all primitives must implement.
 * Provides type inference helpers and internal operations.
 * 
 * @typeParam TState - The state type this primitive holds
 * @typeParam TProxy - The proxy type for interacting with this primitive
 * @typeParam TDefined - Whether the value is guaranteed to be defined (via required() or default())
 * @typeParam THasDefault - Whether this primitive has a default value
 */
export interface Primitive<TState, TProxy, TRequired extends boolean = false, THasDefault extends boolean = false, TSetInput = unknown, TUpdateInput = unknown> {
    readonly _tag: string;
    readonly _State: TState;
    readonly _Proxy: TProxy;
    readonly _TRequired: TRequired;
    readonly _THasDefault: THasDefault;
    readonly _internal: PrimitiveInternal<TState, TProxy>;
    readonly TSetInput: TSetInput;
    readonly TUpdateInput: TUpdateInput;
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
  export type AnyPrimitive = Primitive<any, any, any, any>;
  
  /**
   * Infer the state type from a primitive.
   */
  export type InferState<T> = T extends Primitive<infer S, any, any, any> ? S : never;
  
  /**
   * Infer the proxy type from a primitive.
   */
  export type InferProxy<T> = T extends Primitive<any, infer P, any, any> ? P : never;

  /**
   * Infer the SetInput type from a primitive.
   */
  export type InferSetInput<T> = T extends Primitive<any, any, any, any, infer S, any> ? S : never;

  /**
   * Infer the UpdateInput type from a primitive.
   */
  export type InferUpdateInput<T> = T extends Primitive<any, any, any, any, any, infer U> ? U : never;
  
  /**
   * Helper type to conditionally add undefined based on TRequired and THasDefault.
   * When TRequired is false and THasDefault is false, the value may be undefined.
   * Otherwise, the value is guaranteed to be defined.
   */
  export type MaybeUndefined<T, TRequired extends boolean, THasDefault extends boolean> = TRequired extends false ? THasDefault extends false ? Optional<T> : T : T;

  export type Optional<T> = T | undefined;

  /**
   * Helper type to conditionally add undefined based on TRequired and THasDefault.
   * When TRequired is true and THasDefault is false, the value must be provided.
   * Otherwise, the value may be undefined.
   */
  export type NeedsValue<T, TRequired extends boolean, THasDefault extends boolean> = TRequired extends true ? THasDefault extends false ? T : Optional<T> : Optional<T>;
  
  /**
   * Infer the snapshot type from a primitive.
   * The snapshot is a readonly, type-safe structure suitable for rendering.
   */
  export type InferSnapshot<T> = T extends Primitive<any, infer P, any, any>
    ? P extends { toSnapshot(): infer S } ? S : never
    : never;

  /**
   * Extract THasDefault from a primitive.
   */
  export type HasDefault<T> = T extends Primitive<any, any, any, infer H> ? H : false;

  /**
   * Extract TDefined from a primitive.
   */
  export type IsDefined<T> = T extends Primitive<any, any, infer D, any> ? D : false;

  
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
  // Validation Infrastructure
  // =============================================================================
  
  /**
   * A validator that checks a value and returns whether it's valid.
   */
  export interface Validator<T> {
    readonly validate: (value: T) => boolean;
    readonly message: string;
  }
  

/**
 * Runs all validators against a value, throwing ValidationError if any fail.
 */
export function runValidators<T>(value: T, validators: readonly { validate: (value: T) => boolean; message: string }[]): void {
  for (const validator of validators) {
    if (!validator.validate(value)) {
      throw new ValidationError(validator.message);
    }
  }
}

/**
 * Checks if an operation is compatible with the given operation definitions.
 * @param operation - The operation to check.
 * @param operationDefinitions - The operation definitions to check against.
 * @returns True if the operation is compatible, false otherwise.
 */
export function isCompatibleOperation(operation: Operation.Operation<any, any, any>, operationDefinitions: Record<string, OperationDefinition.OperationDefinition<any, any, any>>) {
  const values = Object.values(operationDefinitions);
  return values.some(value => value.kind === operation.kind);
}

// =============================================================================
// Default Value Utilities
// =============================================================================

/**
 * Applies default values to a partial input, recursively handling nested structs.
 * 
 * Uses a two-layer approach:
 * 1. First, get the struct's initial state (which includes struct-level defaults)
 * 2. Then, layer the provided values on top
 * 3. Finally, ensure nested structs are recursively processed
 * 
 * @param primitive - The primitive definition containing field information
 * @param value - The partial value provided by the user
 * @returns The value with defaults applied for missing fields
 */
export function applyDefaults<T extends AnyPrimitive>(
  primitive: T,
  value: Partial<InferState<T>>
): InferState<T> {
  // Only structs need default merging
  if (primitive._tag === "StructPrimitive") {
    const structPrimitive = primitive as unknown as { 
      fields: Record<string, AnyPrimitive>;
      _internal: { getInitialState: () => Record<string, unknown> | undefined };
    };
    
    // Start with the struct's initial state (struct-level default or field defaults)
    const structInitialState = structPrimitive._internal.getInitialState() ?? {};
    
    // Layer the provided values on top of initial state
    const result: Record<string, unknown> = { ...structInitialState, ...value };
    
    for (const key in structPrimitive.fields) {
      const fieldPrimitive = structPrimitive.fields[key]!;
      
      if (result[key] === undefined) {
        // Field still not provided after merging - try individual field default
        const fieldDefault = fieldPrimitive._internal.getInitialState();
        if (fieldDefault !== undefined) {
          result[key] = fieldDefault;
        }
      } else if (fieldPrimitive._tag === "StructPrimitive" && typeof result[key] === "object" && result[key] !== null) {
        // Recursively apply defaults to nested structs
        result[key] = applyDefaults(fieldPrimitive, result[key] as Partial<InferState<typeof fieldPrimitive>>);
      }
    }
    
    return result as InferState<T>;
  }
  
  // For non-struct primitives, return the value as-is
  return value as InferState<T>;
}

