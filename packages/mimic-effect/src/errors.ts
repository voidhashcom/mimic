/**
 * @since 0.0.1
 * Error types for the Mimic server.
 */
import * as Data from "effect/Data";

// =============================================================================
// Error Types
// =============================================================================

/**
 * Error when a document type is not found in the schema registry.
 */
export class DocumentTypeNotFoundError extends Data.TaggedError(
  "DocumentTypeNotFoundError"
)<{
  readonly documentType: string;
}> {
  get message(): string {
    return `Document type not found: ${this.documentType}`;
  }
}

/**
 * Error when a document is not found.
 */
export class DocumentNotFoundError extends Data.TaggedError(
  "DocumentNotFoundError"
)<{
  readonly documentId: string;
}> {
  get message(): string {
    return `Document not found: ${this.documentId}`;
  }
}

/**
 * Error when authentication fails.
 */
export class AuthenticationError extends Data.TaggedError(
  "AuthenticationError"
)<{
  readonly reason: string;
}> {
  get message(): string {
    return `Authentication failed: ${this.reason}`;
  }
}

/**
 * Error when a transaction is rejected.
 */
export class TransactionRejectedError extends Data.TaggedError(
  "TransactionRejectedError"
)<{
  readonly transactionId: string;
  readonly reason: string;
}> {
  get message(): string {
    return `Transaction ${this.transactionId} rejected: ${this.reason}`;
  }
}

/**
 * Error when parsing a client message fails.
 */
export class MessageParseError extends Data.TaggedError("MessageParseError")<{
  readonly cause: unknown;
}> {
  get message(): string {
    return `Failed to parse message: ${String(this.cause)}`;
  }
}

/**
 * Error when the WebSocket connection is invalid.
 */
export class InvalidConnectionError extends Data.TaggedError(
  "InvalidConnectionError"
)<{
  readonly reason: string;
}> {
  get message(): string {
    return `Invalid connection: ${this.reason}`;
  }
}

/**
 * Error when the document ID is missing from the URL path.
 */
export class MissingDocumentIdError extends Data.TaggedError(
  "MissingDocumentIdError"
)<{
  readonly path?: string;
}> {
  get message(): string {
    return this.path 
      ? `Document ID is required in the URL path: ${this.path}`
      : "Document ID is required in the URL path";
  }
}

/**
 * Union of all Mimic server errors.
 */
export type MimicServerError =
  | DocumentTypeNotFoundError
  | DocumentNotFoundError
  | AuthenticationError
  | TransactionRejectedError
  | MessageParseError
  | InvalidConnectionError
  | MissingDocumentIdError;
