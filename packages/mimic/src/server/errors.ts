import type * as Transaction from "../Transaction";

// =============================================================================
// Server Errors
// =============================================================================

/**
 * Base error class for all mimic-server errors.
 */
export class MimicServerError extends Error {
  readonly _tag: string = "MimicServerError";
  constructor(message: string) {
    super(message);
    this.name = "MimicServerError";
  }
}

/**
 * Error thrown when a transaction fails validation.
 */
export class ValidationError extends MimicServerError {
  readonly _tag = "ValidationError";
  readonly transactionId: string;

  constructor(transactionId: string, message: string) {
    super(`Transaction ${transactionId} validation failed: ${message}`);
    this.name = "ValidationError";
    this.transactionId = transactionId;
  }
}

/**
 * Error thrown when an operation is invalid for the current schema.
 */
export class InvalidOperationError extends MimicServerError {
  readonly _tag = "InvalidOperationError";
  readonly operationKind: string;
  readonly path: string;

  constructor(operationKind: string, path: string, message: string) {
    super(`Invalid operation ${operationKind} at path "${path}": ${message}`);
    this.name = "InvalidOperationError";
    this.operationKind = operationKind;
    this.path = path;
  }
}

/**
 * Error thrown when an operation cannot be applied to the current state.
 */
export class StateValidationError extends MimicServerError {
  readonly _tag = "StateValidationError";
  readonly transactionId: string;
  readonly cause?: Error;

  constructor(transactionId: string, message: string, cause?: Error) {
    super(`Transaction ${transactionId} cannot be applied to current state: ${message}`);
    this.name = "StateValidationError";
    this.transactionId = transactionId;
    this.cause = cause;
  }
}

/**
 * Error thrown when attempting to apply an empty transaction.
 */
export class EmptyTransactionError extends MimicServerError {
  readonly _tag = "EmptyTransactionError";
  readonly transactionId: string;

  constructor(transactionId: string) {
    super(`Transaction ${transactionId} is empty and cannot be applied`);
    this.name = "EmptyTransactionError";
    this.transactionId = transactionId;
  }
}

/**
 * Error thrown when a duplicate transaction is submitted.
 */
export class DuplicateTransactionError extends MimicServerError {
  readonly _tag = "DuplicateTransactionError";
  readonly transactionId: string;

  constructor(transactionId: string) {
    super(`Transaction ${transactionId} has already been processed`);
    this.name = "DuplicateTransactionError";
    this.transactionId = transactionId;
  }
}
