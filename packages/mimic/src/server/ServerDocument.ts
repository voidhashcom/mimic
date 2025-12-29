import * as Document from "../Document";
import * as Transaction from "../Transaction";
import type * as Primitive from "../Primitive";

// =============================================================================
// Server Message Types (matching client's Transport expectations)
// =============================================================================

/**
 * Message sent when broadcasting a committed transaction.
 */
export interface TransactionMessage {
  readonly type: "transaction";
  readonly transaction: Transaction.Transaction;
  /** Server-assigned version number for ordering */
  readonly version: number;
}

/**
 * Message sent when a transaction is rejected.
 */
export interface ErrorMessage {
  readonly type: "error";
  readonly transactionId: string;
  readonly reason: string;
}

/**
 * Message sent as a full state snapshot.
 */
export interface SnapshotMessage {
  readonly type: "snapshot";
  readonly state: unknown;
  readonly version: number;
}

/**
 * Union of all server messages that can be broadcast.
 */
export type ServerMessage = TransactionMessage | ErrorMessage | SnapshotMessage;

// =============================================================================
// Submit Result Types
// =============================================================================

/**
 * Result of submitting a transaction to the server.
 */
export type SubmitResult =
  | { readonly success: true; readonly version: number }
  | { readonly success: false; readonly reason: string };

// =============================================================================
// Server Document Types
// =============================================================================

/**
 * Options for creating a ServerDocument.
 */
export interface ServerDocumentOptions<TSchema extends Primitive.AnyPrimitive> {
  /** The schema defining the document structure */
  readonly schema: TSchema;
  /** Initial value (optional, will use schema defaults if not provided) - uses set input format */
  readonly initialState?: Primitive.InferSetInput<TSchema>;
  /** Initial version number (optional, defaults to 0) */
  readonly initialVersion?: number;
  /** Called when a transaction is successfully applied and should be broadcast */
  readonly onBroadcast: (message: TransactionMessage) => void;
  /** Called when a transaction is rejected (optional, for logging/metrics) */
  readonly onRejection?: (transactionId: string, reason: string) => void;
  /** Maximum number of processed transaction IDs to track for deduplication */
  readonly maxTransactionHistory?: number;
}

/**
 * A ServerDocument maintains the authoritative state and processes client transactions.
 */
export interface ServerDocument<TSchema extends Primitive.AnyPrimitive> {
  /** The schema defining this document's structure */
  readonly schema: TSchema;

  /** Returns the current authoritative state */
  get(): Primitive.InferState<TSchema> | undefined;

  /** Returns the current version number */
  getVersion(): number;

  /**
   * Submits a transaction for processing.
   * Validates and applies the transaction if valid, or rejects it with a reason.
   * @param transaction - The transaction to process
   * @returns SubmitResult indicating success with version or failure with reason
   */
  submit(transaction: Transaction.Transaction): SubmitResult;

  /**
   * Returns a snapshot of the current state and version.
   * Used to initialize new clients or resync after drift.
   */
  getSnapshot(): SnapshotMessage;

  /**
   * Checks if a transaction has already been processed.
   * @param transactionId - The transaction ID to check
   */
  hasProcessed(transactionId: string): boolean;
}

// =============================================================================
// Server Document Implementation
// =============================================================================

/**
 * Creates a new ServerDocument for the given schema.
 */
export const make = <TSchema extends Primitive.AnyPrimitive>(
  options: ServerDocumentOptions<TSchema>
): ServerDocument<TSchema> => {
  const {
    schema,
    initialState,
    initialVersion = 0,
    onBroadcast,
    onRejection,
    maxTransactionHistory = 1000,
  } = options;

  // ==========================================================================
  // Internal State
  // ==========================================================================

  // The authoritative document
  let _document = Document.make(schema, { initial: initialState });

  // Current version number (incremented on each successful transaction)
  let _version = initialVersion;

  // Track processed transaction IDs for deduplication
  const _processedTransactions = new Set<string>();
  const _transactionOrder: string[] = [];

  // ==========================================================================
  // Helper Functions
  // ==========================================================================

  /**
   * Records a transaction as processed, maintaining the history limit.
   */
  const recordTransaction = (transactionId: string): void => {
    _processedTransactions.add(transactionId);
    _transactionOrder.push(transactionId);

    // Evict oldest transactions if over limit
    while (_transactionOrder.length > maxTransactionHistory) {
      const oldest = _transactionOrder.shift();
      if (oldest) {
        _processedTransactions.delete(oldest);
      }
    }
  };

  /**
   * Validates that the transaction can be applied to the current state.
   * Creates a temporary document and attempts to apply the operations.
   */
  const validateTransaction = (
    transaction: Transaction.Transaction
  ): { valid: true } | { valid: false; reason: string } => {
    // Check for empty transaction
    if (Transaction.isEmpty(transaction)) {
      return { valid: false, reason: "Transaction is empty" };
    }

    // Check for duplicate transaction
    if (_processedTransactions.has(transaction.id)) {
      return { valid: false, reason: "Transaction has already been processed" };
    }

    // Create a temporary document with current state to test the operations
    const currentState = _document.get();
    const tempDoc = Document.make(schema, { initial: currentState });

    try {
      // Attempt to apply all operations
      tempDoc.apply(transaction.ops);
      return { valid: true };
    } catch (error) {
      // Operations failed to apply
      const message = error instanceof Error ? error.message : String(error);
      return { valid: false, reason: message };
    }
  };

  // ==========================================================================
  // Public API
  // ==========================================================================

  const serverDocument: ServerDocument<TSchema> = {
    schema,

    get: (): Primitive.InferState<TSchema> | undefined => {
      return _document.get();
    },

    getVersion: (): number => {
      return _version;
    },

    submit: (transaction: Transaction.Transaction): SubmitResult => {
      // Validate the transaction
      const validation = validateTransaction(transaction);

      if (!validation.valid) {
        // Notify rejection callback if provided
        onRejection?.(transaction.id, validation.reason);

        return {
          success: false,
          reason: validation.reason,
        };
      }

      // Apply the transaction to the authoritative state
      try {
        _document.apply(transaction.ops);
      } catch (error) {
        // This shouldn't happen since we validated, but handle gracefully
        const reason = error instanceof Error ? error.message : String(error);
        onRejection?.(transaction.id, reason);
        return { success: false, reason };
      }

      // Increment version
      _version += 1;

      // Record as processed
      recordTransaction(transaction.id);

      // Broadcast the confirmed transaction
      const message: TransactionMessage = {
        type: "transaction",
        transaction,
        version: _version,
      };
      onBroadcast(message);

      return {
        success: true,
        version: _version,
      };
    },

    getSnapshot: (): SnapshotMessage => {
      return {
        type: "snapshot",
        state: _document.get(),
        version: _version,
      };
    },

    hasProcessed: (transactionId: string): boolean => {
      return _processedTransactions.has(transactionId);
    },
  };

  return serverDocument;
};
