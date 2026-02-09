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
     * Converts a set input value to state format.
     * For most primitives, this is a simple pass-through with defaults applied.
     * For Tree primitives, this converts nested input to flat TreeState.
     *
     * @param input - The set input value
     * @returns The corresponding state value
     */
    readonly convertSetInputToState?: (input: unknown) => TState;
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
   * Works with both Primitive interface types and types with a TSetInput property (like TreeNodePrimitive).
   */
  export type InferSetInput<T> = 
    T extends Primitive<any, any, any, any, infer S, any> ? S : 
    T extends { TSetInput: infer S } ? S : 
    never;

  /**
   * Infer the UpdateInput type from a primitive.
   * Works with both Primitive interface types and types with a TUpdateInput property (like TreeNodePrimitive).
   */
  export type InferUpdateInput<T> = 
    T extends Primitive<any, any, any, any, any, infer U> ? U : 
    T extends { TUpdateInput: infer U } ? U : 
    never;
  
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

  /**
   * Infer whether a primitive is required.
   * Alias for IsDefined for clarity.
   */
  export type IsRequired<T> = IsDefined<T>;


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
 * Returns true if a primitive can represent null as a meaningful value.
 * This is used to avoid pruning explicit null values for null-capable scalar unions.
 */
export function primitiveAllowsNullValue(primitive: AnyPrimitive): boolean {
  if (primitive._tag === "LiteralPrimitive") {
    return (primitive as { literal: unknown }).literal === null;
  }

  if (primitive._tag === "EitherPrimitive") {
    const variants = (primitive as { _schema?: { variants?: readonly AnyPrimitive[] } })._schema?.variants;
    return Array.isArray(variants) && variants.some((variant) => primitiveAllowsNullValue(variant));
  }

  return false;
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
 * Applies default values to a partial input, recursively handling nested structs and unions.
 * 
 * Uses a two-layer approach:
 * 1. First, get the struct's initial state (which includes struct-level defaults)
 * 2. Then, layer the provided values on top
 * 3. Finally, ensure nested structs and unions are recursively processed
 * 
 * @param primitive - The primitive definition containing field information
 * @param value - The partial value provided by the user
 * @returns The value with defaults applied for missing fields
 */
export function applyDefaults<T extends AnyPrimitive>(
  primitive: T,
  value: Partial<InferState<T>>
): InferState<T> {
  // Handle StructPrimitive
  if (primitive._tag === "StructPrimitive") {
    const structPrimitive = primitive as unknown as { 
      fields: Record<string, AnyPrimitive>;
      _internal: { getInitialState: () => Record<string, unknown> | undefined };
    };
    
    // Start with the struct's initial state (struct-level default or field defaults)
    const structInitialState = structPrimitive._internal.getInitialState() ?? {};
    
    // Layer the provided values on top of initial state
    const result: Record<string, unknown> = { ...structInitialState, ...value };
    const inputObject =
      typeof value === "object" && value !== null
        ? (value as Record<string, unknown>)
        : undefined;
    
    for (const key in structPrimitive.fields) {
      const fieldPrimitive = structPrimitive.fields[key]!;
      const hasExplicitKey = inputObject !== undefined && Object.prototype.hasOwnProperty.call(inputObject, key);
      const explicitValue = hasExplicitKey ? inputObject[key] : undefined;
      const fieldDefault = fieldPrimitive._internal.getInitialState();
      const isRequiredWithoutDefault =
        (fieldPrimitive as { _schema?: { required?: boolean } })._schema?.required === true &&
        fieldDefault === undefined;

      // Explicit undefined values always prune optional keys.
      // Explicit null values prune optional keys unless null is a valid semantic value for this field.
      // Required fields without defaults reject nullish values.
      const shouldPruneExplicitNullish =
        hasExplicitKey &&
        (
          explicitValue === undefined ||
          (explicitValue === null && !primitiveAllowsNullValue(fieldPrimitive))
        );
      if (shouldPruneExplicitNullish) {
        if (isRequiredWithoutDefault) {
          throw new ValidationError(`Field "${key}" is required and cannot be null or undefined`);
        }
        delete result[key];
        continue;
      }
      
      if (!hasExplicitKey && result[key] === undefined) {
        // Field still not provided after merging - try individual field default
        if (fieldDefault !== undefined) {
          result[key] = fieldDefault;
        }
      } else if (
        hasExplicitKey &&
        typeof explicitValue === "object" &&
        explicitValue !== null
      ) {
        // Recursively apply defaults to nested structs and unions
        if (fieldPrimitive._tag === "StructPrimitive" || fieldPrimitive._tag === "UnionPrimitive") {
          result[key] = applyDefaults(fieldPrimitive, explicitValue as Partial<InferState<typeof fieldPrimitive>>);
        }
      }
    }
    
    return result as InferState<T>;
  }
  
  // Handle UnionPrimitive
  if (primitive._tag === "UnionPrimitive") {
    const unionPrimitive = primitive as unknown as {
      _schema: {
        discriminator: string;
        variants: Record<string, AnyPrimitive>;
      };
    };
    
    // Validate that value is an object
    if (typeof value !== "object" || value === null) {
      return value as InferState<T>;
    }
    
    const discriminator = unionPrimitive._schema.discriminator;
    const discriminatorValue = (value as Record<string, unknown>)[discriminator];
    
    // Find the matching variant based on discriminator value
    let matchingVariantKey: string | undefined;
    for (const variantKey in unionPrimitive._schema.variants) {
      const variant = unionPrimitive._schema.variants[variantKey]!;
      // Variants are structs - check if the discriminator field's literal matches
      if (variant._tag === "StructPrimitive") {
        const variantStruct = variant as unknown as {
          fields: Record<string, AnyPrimitive>;
        };
        const discriminatorField = variantStruct.fields[discriminator];
        if (discriminatorField && discriminatorField._tag === "LiteralPrimitive") {
          const literalPrimitive = discriminatorField as unknown as { literal: unknown };
          if (literalPrimitive.literal === discriminatorValue) {
            matchingVariantKey = variantKey;
            break;
          }
        }
      }
    }
    
    if (!matchingVariantKey) {
      // No matching variant found - return value as-is
      return value as InferState<T>;
    }
    
    // Apply defaults using the matching variant's struct
    const variantPrimitive = unionPrimitive._schema.variants[matchingVariantKey]!;
    return applyDefaults(variantPrimitive, value as Partial<InferState<typeof variantPrimitive>>) as InferState<T>;
  }
  
  // For other primitives, return the value as-is
  return value as InferState<T>;
}
