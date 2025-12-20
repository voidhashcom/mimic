import * as Operation from "./Operation";

/**
 * A Transaction represents a group of operations that were applied atomically.
 */
export interface Transaction {
  /** Unique identifier for this transaction */
  readonly id: string;
  /** Operations contained in this transaction */
  readonly ops: ReadonlyArray<Operation.Operation<any, any, any>>;
  /** Timestamp when the transaction was created */
  readonly timestamp: number;
}

/**
 * Creates a new Transaction with the given operations.
 */
export const make = (ops: ReadonlyArray<Operation.Operation<any, any, any>>): Transaction => ({
  id: crypto.randomUUID(),
  ops,
  timestamp: Date.now(),
});

/**
 * Creates an empty Transaction.
 */
export const empty = (): Transaction => make([]);

/**
 * Checks if a transaction is empty (has no operations).
 */
export const isEmpty = (tx: Transaction): boolean => tx.ops.length === 0;

/**
 * Merges multiple transactions into one.
 */
export const merge = (txs: ReadonlyArray<Transaction>): Transaction => {
  const allOps = txs.flatMap(tx => tx.ops);
  return make(allOps);
};


/**
 * Encoded representation of a Transaction for network transport.
 */
export interface EncodedTransaction {
  readonly id: string;
  readonly ops: ReadonlyArray<Operation.EncodedOperation>;
  readonly timestamp: number;
}

/**
 * Encodes a Transaction to a JSON-serializable format for network transport.
 * @param transaction - The transaction to encode.
 * @returns The encoded representation.
 */
export const encode = (transaction: Transaction): EncodedTransaction => ({
  id: transaction.id,
  ops: transaction.ops.map(Operation.encode),
  timestamp: transaction.timestamp,
});

/**
 * Decodes an encoded transaction back to a Transaction.
 * @param encoded - The encoded representation.
 * @returns The decoded Transaction.
 */
export const decode = (encoded: EncodedTransaction): Transaction => ({
  id: encoded.id,
  ops: encoded.ops.map(Operation.decode),
  timestamp: encoded.timestamp,
});
