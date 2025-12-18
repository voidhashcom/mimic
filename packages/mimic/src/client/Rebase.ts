import type * as Operation from "../Operation";
import type * as Transaction from "../Transaction";
import type * as Primitive from "../Primitive";
import * as OperationPath from "../OperationPath";
import * as Transform from "../Transform";

// =============================================================================
// Re-export Transform types from mimic for backwards compatibility
// =============================================================================

export type TransformResult = Transform.TransformResult;

// =============================================================================
// Operation Transformation
// =============================================================================

/**
 * Transforms a client operation against a server operation using a primitive.
 * 
 * This delegates to the primitive's transformOperation method, which handles
 * type-specific conflict resolution.
 * 
 * @param clientOp - The client's operation to transform
 * @param serverOp - The server's operation that has already been applied
 * @param primitive - The root primitive to use for transformation
 * @returns TransformResult indicating how the client operation should be handled
 */
export const transformOperationWithPrimitive = (
  clientOp: Operation.Operation<any, any, any>,
  serverOp: Operation.Operation<any, any, any>,
  primitive: Primitive.AnyPrimitive
): TransformResult => {
  return primitive._internal.transformOperation(clientOp, serverOp);
};

/**
 * Transforms a client operation against a server operation.
 *
 * This is a standalone implementation for cases where the primitive is not available.
 * For schema-aware transformation, use transformOperationWithPrimitive instead.
 *
 * The key principle: client ops "shadow" server ops for the same path,
 * meaning if both touch the same field, the client's intention wins
 * (since it was made with knowledge of the server state at that time).
 */
export const transformOperation = (
  clientOp: Operation.Operation<any, any, any>,
  serverOp: Operation.Operation<any, any, any>
): TransformResult => {
  const clientPath = clientOp.path;
  const serverPath = serverOp.path;

  // If paths don't overlap at all, no transformation needed
  if (!OperationPath.pathsOverlap(clientPath, serverPath)) {
    return { type: "transformed", operation: clientOp };
  }

  // Handle array operations specially
  if (serverOp.kind === "array.remove") {
    // If server removed an array element that client is operating on
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

  if (serverOp.kind === "array.insert" && clientOp.kind === "array.insert") {
    // Both inserting into same array - positions are independent (fractional indexing)
    // No transformation needed as fractional indices handle ordering
    return { type: "transformed", operation: clientOp };
  }

  if (serverOp.kind === "array.move" && clientOp.kind === "array.move") {
    // Both moving elements - if same element, client wins (last-write-wins for position)
    const serverMoveId = (serverOp.payload as { id: string }).id;
    const clientMoveId = (clientOp.payload as { id: string }).id;

    if (serverMoveId === clientMoveId) {
      // Client's move supersedes server's move
      return { type: "transformed", operation: clientOp };
    }
    // Different elements - no conflict
    return { type: "transformed", operation: clientOp };
  }

  // For set operations on the same exact path: client wins (last-write-wins)
  if (OperationPath.pathsEqual(clientPath, serverPath)) {
    // Both operations target the same path
    // Client operation was made with intent to set this value,
    // so it should override the server's change
    return { type: "transformed", operation: clientOp };
  }

  // If server set a parent path, client's child operation might be invalid
  if (OperationPath.isPrefix(serverPath, clientPath)) {
    const serverKind = serverOp.kind;
    if (
      serverKind === "struct.set" ||
      serverKind === "array.set" ||
      serverKind === "union.set"
    ) {
      // Server replaced the entire parent - client's child op may be invalid
      // However, for optimistic updates, we let the client op proceed
      // and the server will validate/reject if needed
      return { type: "transformed", operation: clientOp };
    }
  }

  // Default: no transformation needed, client op proceeds as-is
  return { type: "transformed", operation: clientOp };
};

/**
 * Transforms all operations in a client transaction against a server transaction.
 * Uses the primitive's transformOperation for schema-aware transformation.
 */
export const transformTransactionWithPrimitive = (
  clientTx: Transaction.Transaction,
  serverTx: Transaction.Transaction,
  primitive: Primitive.AnyPrimitive
): Transaction.Transaction => {
  const transformedOps: Operation.Operation<any, any, any>[] = [];

  for (const clientOp of clientTx.ops) {
    let currentOp: Operation.Operation<any, any, any> | null = clientOp;

    // Transform against each server operation
    for (const serverOp of serverTx.ops) {
      if (currentOp === null) break;

      const result = transformOperationWithPrimitive(currentOp, serverOp, primitive);

      switch (result.type) {
        case "transformed":
          currentOp = result.operation;
          break;
        case "noop":
          currentOp = null;
          break;
        case "conflict":
          // For now, treat conflicts as the client op proceeding
          // Server will ultimately validate
          break;
      }
    }

    if (currentOp !== null) {
      transformedOps.push(currentOp);
    }
  }

  // Return a new transaction with the same ID but transformed ops
  return {
    id: clientTx.id,
    ops: transformedOps,
    timestamp: clientTx.timestamp,
  };
};

/**
 * Transforms all operations in a client transaction against a server transaction.
 * This is a standalone version that doesn't require a primitive.
 */
export const transformTransaction = (
  clientTx: Transaction.Transaction,
  serverTx: Transaction.Transaction
): Transaction.Transaction => {
  const transformedOps: Operation.Operation<any, any, any>[] = [];

  for (const clientOp of clientTx.ops) {
    let currentOp: Operation.Operation<any, any, any> | null = clientOp;

    // Transform against each server operation
    for (const serverOp of serverTx.ops) {
      if (currentOp === null) break;

      const result = transformOperation(currentOp, serverOp);

      switch (result.type) {
        case "transformed":
          currentOp = result.operation;
          break;
        case "noop":
          currentOp = null;
          break;
        case "conflict":
          // For now, treat conflicts as the client op proceeding
          // Server will ultimately validate
          break;
      }
    }

    if (currentOp !== null) {
      transformedOps.push(currentOp);
    }
  }

  // Return a new transaction with the same ID but transformed ops
  return {
    id: clientTx.id,
    ops: transformedOps,
    timestamp: clientTx.timestamp,
  };
};

/**
 * Rebases a list of pending transactions against a server transaction using a primitive.
 *
 * This is called when a server transaction arrives that is NOT one of our pending
 * transactions. We need to transform all pending transactions to work correctly
 * on top of the new server state.
 */
export const rebasePendingTransactionsWithPrimitive = (
  pendingTxs: ReadonlyArray<Transaction.Transaction>,
  serverTx: Transaction.Transaction,
  primitive: Primitive.AnyPrimitive
): Transaction.Transaction[] => {
  return pendingTxs.map((pendingTx) =>
    transformTransactionWithPrimitive(pendingTx, serverTx, primitive)
  );
};

/**
 * Rebases a list of pending transactions against a server transaction.
 *
 * This is called when a server transaction arrives that is NOT one of our pending
 * transactions. We need to transform all pending transactions to work correctly
 * on top of the new server state.
 */
export const rebasePendingTransactions = (
  pendingTxs: ReadonlyArray<Transaction.Transaction>,
  serverTx: Transaction.Transaction
): Transaction.Transaction[] => {
  return pendingTxs.map((pendingTx) =>
    transformTransaction(pendingTx, serverTx)
  );
};

/**
 * Rebases pending transactions after a rejection using a primitive.
 *
 * When a transaction is rejected, we need to re-transform remaining pending
 * transactions as if the rejected transaction never happened. This is done by
 * rebuilding from the original operations against the current server state.
 *
 * @param originalPendingTxs - The original pending transactions before any rebasing
 * @param rejectedTxId - ID of the rejected transaction
 * @param serverTxsSinceOriginal - Server transactions that have arrived since original
 * @param primitive - The root primitive to use for transformation
 */
export const rebaseAfterRejectionWithPrimitive = (
  originalPendingTxs: ReadonlyArray<Transaction.Transaction>,
  rejectedTxId: string,
  serverTxsSinceOriginal: ReadonlyArray<Transaction.Transaction>,
  primitive: Primitive.AnyPrimitive
): Transaction.Transaction[] => {
  // Filter out the rejected transaction
  const remainingOriginals = originalPendingTxs.filter(
    (tx) => tx.id !== rejectedTxId
  );

  // Re-transform each remaining transaction against all server transactions
  let result = [...remainingOriginals];

  for (const serverTx of serverTxsSinceOriginal) {
    result = rebasePendingTransactionsWithPrimitive(result, serverTx, primitive);
  }

  return result;
};

/**
 * Rebases pending transactions after a rejection.
 *
 * When a transaction is rejected, we need to re-transform remaining pending
 * transactions as if the rejected transaction never happened. This is done by
 * rebuilding from the original operations against the current server state.
 *
 * @param originalPendingTxs - The original pending transactions before any rebasing
 * @param rejectedTxId - ID of the rejected transaction
 * @param serverTxsSinceOriginal - Server transactions that have arrived since original
 */
export const rebaseAfterRejection = (
  originalPendingTxs: ReadonlyArray<Transaction.Transaction>,
  rejectedTxId: string,
  serverTxsSinceOriginal: ReadonlyArray<Transaction.Transaction>
): Transaction.Transaction[] => {
  // Filter out the rejected transaction
  const remainingOriginals = originalPendingTxs.filter(
    (tx) => tx.id !== rejectedTxId
  );

  // Re-transform each remaining transaction against all server transactions
  let result = [...remainingOriginals];

  for (const serverTx of serverTxsSinceOriginal) {
    result = rebasePendingTransactions(result, serverTx);
  }

  return result;
};
