/**
 * @since 0.0.1
 * Protocol and schema definitions for document communication.
 */
import * as Schema from "effect/Schema";

// =============================================================================
// Schema Definitions
// =============================================================================

/**
 * Schema for a transaction operation.
 */
export const OperationSchema = Schema.Struct({
  kind: Schema.String,
  path: Schema.Unknown, // OperationPath is complex, treat as unknown
  payload: Schema.Unknown,
});

/**
 * Schema for a transaction.
 */
export const TransactionSchema = Schema.Struct({
  id: Schema.String,
  ops: Schema.Array(OperationSchema),
  timestamp: Schema.Number,
});

export type Transaction = Schema.Schema.Type<typeof TransactionSchema>;

/**
 * Schema for a server message that broadcasts a committed transaction.
 */
export const TransactionMessageSchema = Schema.Struct({
  type: Schema.Literal("transaction"),
  transaction: TransactionSchema,
  version: Schema.Number,
});

export type TransactionMessage = Schema.Schema.Type<typeof TransactionMessageSchema>;

/**
 * Schema for a server message containing a snapshot.
 */
export const SnapshotMessageSchema = Schema.Struct({
  type: Schema.Literal("snapshot"),
  state: Schema.Unknown,
  version: Schema.Number,
});

export type SnapshotMessage = Schema.Schema.Type<typeof SnapshotMessageSchema>;

/**
 * Schema for a server error message.
 */
export const ErrorMessageSchema = Schema.Struct({
  type: Schema.Literal("error"),
  transactionId: Schema.String,
  reason: Schema.String,
});

export type ErrorMessage = Schema.Schema.Type<typeof ErrorMessageSchema>;

/**
 * Schema for a pong message.
 */
export const PongMessageSchema = Schema.Struct({
  type: Schema.Literal("pong"),
});

export type PongMessage = Schema.Schema.Type<typeof PongMessageSchema>;

/**
 * Schema for authentication result message.
 */
export const AuthResultMessageSchema = Schema.Struct({
  type: Schema.Literal("auth_result"),
  success: Schema.Boolean,
  error: Schema.optional(Schema.String),
});

export type AuthResultMessage = Schema.Schema.Type<typeof AuthResultMessageSchema>;

/**
 * Union of all server broadcast messages.
 */
export const ServerBroadcastSchema = Schema.Union(
  TransactionMessageSchema,
  ErrorMessageSchema
);

export type ServerBroadcast = Schema.Schema.Type<typeof ServerBroadcastSchema>;

// =============================================================================
// Submit Result
// =============================================================================

/**
 * Result of submitting a transaction.
 */
export const SubmitResultSchema = Schema.Union(
  Schema.Struct({
    success: Schema.Literal(true),
    version: Schema.Number,
  }),
  Schema.Struct({
    success: Schema.Literal(false),
    reason: Schema.String,
  })
);

export type SubmitResult = Schema.Schema.Type<typeof SubmitResultSchema>;
