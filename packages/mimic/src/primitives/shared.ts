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

