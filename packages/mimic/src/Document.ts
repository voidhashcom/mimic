import * as Operation from "./Operation";
import * as OperationPath from "./OperationPath";
import * as ProxyEnvironment from "./ProxyEnvironment";
import * as Transaction from "./Transaction";
import type * as Primitive from "./Primitive";

// =============================================================================
// Document Errors
// =============================================================================

/**
 * Error thrown when attempting to start a nested transaction.
 */
export class NestedTransactionError extends Error {
  readonly _tag = "NestedTransactionError";
  constructor() {
    super("Nested transactions are not supported");
    this.name = "NestedTransactionError";
  }
}

/**
 * Error thrown when an operation fails to apply.
 */
export class OperationError extends Error {
  readonly _tag = "OperationError";
  constructor(message: string) {
    super(message);
    this.name = "OperationError";
  }
}

// =============================================================================
// Document Interface
// =============================================================================

/**
 * A Document manages state for a primitive-based schema with transaction support.
 */
export interface Document<TSchema extends Primitive.AnyPrimitive> {
  /** The schema defining this document's structure */
  readonly schema: TSchema;
  
  /** Root proxy for accessing and modifying document data */
  readonly root: Primitive.InferProxy<TSchema>;
  
  /** Returns the current document state */
  get(): Primitive.InferState<TSchema> | undefined;
  
  /**
   * Runs a function within a transaction.
   * All operations are collected and applied atomically.
   * If the function throws, all changes are rolled back.
   * @returns The return value of the function
   */
  transaction<R>(fn: (root: Primitive.InferProxy<TSchema>) => R): R;
  
  /**
   * Applies external operations (e.g., from server/peers) to the document.
   * These operations are NOT added to pending operations.
   */
  apply(ops: ReadonlyArray<Operation.Operation<any, any, any>>): void;
  
  /**
   * Returns pending local operations as a Transaction and clears the buffer.
   */
  flush(): Transaction.Transaction;
}

// =============================================================================
// Document Options
// =============================================================================

export interface DocumentOptions<TSchema extends Primitive.AnyPrimitive> {
  /** Initial state for the document */
  readonly initial?: Primitive.InferState<TSchema>;
}

// =============================================================================
// Document Implementation
// =============================================================================

/**
 * Creates a new Document for the given schema.
 */
export const make = <TSchema extends Primitive.AnyPrimitive>(
  schema: TSchema,
  options?: DocumentOptions<TSchema>
): Document<TSchema> => {
  // Internal state
  let _state: Primitive.InferState<TSchema> | undefined = 
    options?.initial ?? schema._internal.getInitialState();
  
  // Pending operations buffer (local changes not yet flushed)
  let _pending: Operation.Operation<any, any, any>[] = [];
  
  // Transaction state
  let _inTransaction = false;
  let _txOps: Operation.Operation<any, any, any>[] = [];
  let _txBaseState: Primitive.InferState<TSchema> | undefined = undefined;

  /**
   * Gets state at the given path.
   */
  const getStateAtPath = (path: OperationPath.OperationPath): unknown => {
    const tokens = path.toTokens().filter(t => t !== "");
    
    if (tokens.length === 0) {
      return _state;
    }
    
    let current: unknown = _state;
    for (const token of tokens) {
      if (current === null || current === undefined) {
        return undefined;
      }
      
      if (typeof current === "object") {
        // Handle array entries (which have { id, pos, value } structure)
        if (Array.isArray(current)) {
          // Try to find by ID in array entries
          const entry = current.find((e: any) => e.id === token);
          if (entry) {
            current = entry.value;
            continue;
          }
        }
        
        // Handle regular object property access
        current = (current as Record<string, unknown>)[token];
      } else {
        return undefined;
      }
    }
    
    return current;
  };

  /**
   * Applies a single operation to the current state.
   */
  const applyOperation = (op: Operation.Operation<any, any, any>): void => {
    try {
      _state = schema._internal.applyOperation(_state, op);
    } catch (error) {
      if (error instanceof Error) {
        throw new OperationError(error.message);
      }
      throw new OperationError(String(error));
    }
  };

  /**
   * Handles an operation from a proxy.
   * In transaction mode: collects operations, applies to state immediately for subsequent reads.
   * Outside transaction mode: auto-wraps in a single-operation transaction.
   */
  const handleOperation = (op: Operation.Operation<any, any, any>): void => {
    if (_inTransaction) {
      // In transaction: collect op and apply immediately for subsequent reads
      _txOps.push(op);
      applyOperation(op);
    } else {
      // Not in transaction: auto-wrap in single-operation transaction
      const baseState = _state;
      try {
        applyOperation(op);
        _pending.push(op);
      } catch (error) {
        // Rollback on error
        _state = baseState;
        throw error;
      }
    }
  };

  /**
   * Creates a ProxyEnvironment for the document.
   */
  const createEnv = (): ProxyEnvironment.ProxyEnvironment => {
    return ProxyEnvironment.make({
      onOperation: handleOperation,
      getState: getStateAtPath,
    });
  };

  // Create the root proxy
  const env = createEnv();
  const rootProxy = schema._internal.createProxy(env, OperationPath.make("")) as Primitive.InferProxy<TSchema>;

  // Document implementation
  const document: Document<TSchema> = {
    schema,
    root: rootProxy,
    
    get: (): Primitive.InferState<TSchema> | undefined => {
      return _state;
    },
    
    transaction: <R,>(fn: (root: Primitive.InferProxy<TSchema>) => R): R => {
      if (_inTransaction) {
        throw new NestedTransactionError();
      }
      
      // Start transaction
      _inTransaction = true;
      _txOps = [];
      _txBaseState = _state;
      
      try {
        // Execute the transaction function
        const result = fn(rootProxy);
        
        // Commit: add transaction ops to pending
        _pending.push(..._txOps);
        
        return result;
      } catch (error) {
        // Rollback: restore base state
        _state = _txBaseState;
        throw error;
      } finally {
        // Clean up transaction state
        _inTransaction = false;
        _txOps = [];
        _txBaseState = undefined;
      }
    },
    
    apply: (ops: ReadonlyArray<Operation.Operation<any, any, any>>): void => {
      for (const op of ops) {
        applyOperation(op);
      }
    },
    
    flush: (): Transaction.Transaction => {
      const tx = Transaction.make(_pending);
      _pending = [];
      return tx;
    },
  };

  return document;
};
