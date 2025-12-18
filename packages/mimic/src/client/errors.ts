import type * as Transaction from "../Transaction";

// =============================================================================
// Client Errors
// =============================================================================

/**
 * Base error class for all mimic-client errors.
 */
export class MimicClientError extends Error {
  readonly _tag: string = "MimicClientError";
  constructor(message: string) {
    super(message);
    this.name = "MimicClientError";
  }
}

/**
 * Error thrown when a transaction is rejected by the server.
 */
export class TransactionRejectedError extends MimicClientError {
  readonly _tag = "TransactionRejectedError";
  readonly transaction: Transaction.Transaction;
  readonly reason: string;

  constructor(transaction: Transaction.Transaction, reason: string) {
    super(`Transaction ${transaction.id} rejected: ${reason}`);
    this.name = "TransactionRejectedError";
    this.transaction = transaction;
    this.reason = reason;
  }
}

/**
 * Error thrown when the transport is not connected.
 */
export class NotConnectedError extends MimicClientError {
  readonly _tag = "NotConnectedError";
  constructor() {
    super("Transport is not connected");
    this.name = "NotConnectedError";
  }
}

/**
 * Error thrown when connection to the server fails.
 */
export class ConnectionError extends MimicClientError {
  readonly _tag = "ConnectionError";
  readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = "ConnectionError";
    this.cause = cause;
  }
}

/**
 * Error thrown when state drift is detected and cannot be recovered.
 */
export class StateDriftError extends MimicClientError {
  readonly _tag = "StateDriftError";
  readonly expectedVersion: number;
  readonly receivedVersion: number;

  constructor(expectedVersion: number, receivedVersion: number) {
    super(
      `State drift detected: expected version ${expectedVersion}, received ${receivedVersion}`
    );
    this.name = "StateDriftError";
    this.expectedVersion = expectedVersion;
    this.receivedVersion = receivedVersion;
  }
}

/**
 * Error thrown when a pending transaction times out waiting for confirmation.
 */
export class TransactionTimeoutError extends MimicClientError {
  readonly _tag = "TransactionTimeoutError";
  readonly transaction: Transaction.Transaction;
  readonly timeoutMs: number;

  constructor(transaction: Transaction.Transaction, timeoutMs: number) {
    super(
      `Transaction ${transaction.id} timed out after ${timeoutMs}ms waiting for confirmation`
    );
    this.name = "TransactionTimeoutError";
    this.transaction = transaction;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Error thrown when rebasing operations fails.
 */
export class RebaseError extends MimicClientError {
  readonly _tag = "RebaseError";
  readonly transactionId: string;

  constructor(transactionId: string, message: string) {
    super(`Failed to rebase transaction ${transactionId}: ${message}`);
    this.name = "RebaseError";
    this.transactionId = transactionId;
  }
}

/**
 * Error thrown when the client document is in an invalid state.
 */
export class InvalidStateError extends MimicClientError {
  readonly _tag = "InvalidStateError";
  constructor(message: string) {
    super(message);
    this.name = "InvalidStateError";
  }
}

/**
 * Error thrown when WebSocket connection or communication fails.
 */
export class WebSocketError extends MimicClientError {
  readonly _tag = "WebSocketError";
  readonly code?: number;
  readonly reason?: string;

  constructor(message: string, code?: number, reason?: string) {
    super(message);
    this.name = "WebSocketError";
    this.code = code;
    this.reason = reason;
  }
}

/**
 * Error thrown when authentication fails.
 */
export class AuthenticationError extends MimicClientError {
  readonly _tag = "AuthenticationError";
  constructor(message: string) {
    super(message);
    this.name = "AuthenticationError";
  }
}
