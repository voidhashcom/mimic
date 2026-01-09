/**
 * @voidhash/mimic-server
 *
 * Server-side document management for the Mimic sync engine.
 * Provides authoritative state management with transaction validation.
 *
 * @since 0.0.1
 */

// =============================================================================
// Server Document
// =============================================================================

export * as ServerDocument from "./ServerDocument";

// =============================================================================
// Errors
// =============================================================================

export {
  MimicServerError,
  ValidationError,
  InvalidOperationError,
  StateValidationError,
  EmptyTransactionError,
  DuplicateTransactionError,
} from "./errors";

// =============================================================================
// Re-export Types (for convenience)
// =============================================================================

export type {
  ServerMessage,
  TransactionMessage,
  ErrorMessage,
  SnapshotMessage,
  SubmitResult,
  ServerDocumentOptions,
} from "./ServerDocument";
