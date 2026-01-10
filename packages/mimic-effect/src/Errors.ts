/**
 * @voidhash/mimic-effect - Error Types
 *
 * All error types used throughout the mimic-effect package.
 */
import { Data } from "effect";

// =============================================================================
// Storage Errors
// =============================================================================

/**
 * Error when ColdStorage (snapshot storage) operations fail
 */
export class ColdStorageError extends Data.TaggedError("ColdStorageError")<{
  readonly documentId: string;
  readonly operation: "load" | "save" | "delete";
  readonly cause: unknown;
}> {}

/**
 * Error when HotStorage (WAL storage) operations fail
 */
export class HotStorageError extends Data.TaggedError("HotStorageError")<{
  readonly documentId: string;
  readonly operation: "append" | "getEntries" | "truncate" | "appendWithCheck";
  readonly cause: unknown;
}> {}

/**
 * Error when WAL append detects a version gap.
 * This indicates either:
 * - A bug in the application (skipped a version)
 * - Concurrent writes to the same document
 * - Data corruption in WAL storage
 */
export class WalVersionGapError extends Data.TaggedError("WalVersionGapError")<{
  readonly documentId: string;
  readonly expectedVersion: number;
  readonly actualPreviousVersion: number | undefined;
}> {}

// =============================================================================
// Auth Errors
// =============================================================================

/**
 * Error when authentication fails (invalid token, expired, etc.)
 */
export class AuthenticationError extends Data.TaggedError(
  "AuthenticationError"
)<{
  readonly reason: string;
}> {}

/**
 * Error when authorization fails (user doesn't have required permission)
 */
export class AuthorizationError extends Data.TaggedError("AuthorizationError")<{
  readonly reason: string;
  readonly required: "read" | "write";
  readonly actual: "read" | "write";
}> {}

// =============================================================================
// Connection Errors
// =============================================================================

/**
 * Error when document ID is missing from WebSocket request path
 */
export class MissingDocumentIdError extends Data.TaggedError(
  "MissingDocumentIdError"
)<{
  readonly path: string;
}> {}

/**
 * Error when WebSocket message cannot be parsed
 */
export class MessageParseError extends Data.TaggedError("MessageParseError")<{
  readonly cause: unknown;
}> {}

// =============================================================================
// Transaction Errors
// =============================================================================

/**
 * Error when a transaction is rejected by the document
 */
export class TransactionRejectedError extends Data.TaggedError(
  "TransactionRejectedError"
)<{
  readonly transactionId: string;
  readonly reason: string;
}> {}

// =============================================================================
// Union Type
// =============================================================================

/**
 * Union of all mimic-effect errors
 */
export type MimicError =
  | ColdStorageError
  | HotStorageError
  | WalVersionGapError
  | AuthenticationError
  | AuthorizationError
  | MissingDocumentIdError
  | MessageParseError
  | TransactionRejectedError;
