/**
 * @voidhash/mimic-server-effect
 *
 * Effect-based server implementation for Mimic sync engine.
 *
 * @since 0.0.1
 */

// =============================================================================
// Main Server
// =============================================================================

export * as MimicServer from "./MimicServer.js";

// =============================================================================
// Configuration
// =============================================================================

export {
  MimicServerConfigTag,
  type MimicServerConfig,
  type MimicServerConfigOptions,
  type SchemaRegistry,
  type AuthHandler,
  type AuthResult,
  type PersistenceMode,
  makeSchemaRegistry,
  make as makeConfig,
  layer as configLayer,
} from "./MimicConfig.js";

// =============================================================================
// Document Manager
// =============================================================================

export {
  DocumentManagerTag,
  type DocumentManager,
  layer as documentManagerLayer,
} from "./DocumentManager.js";

// =============================================================================
// Protocol
// =============================================================================

export {
  TransactionSchema,
  TransactionMessageSchema,
  SnapshotMessageSchema,
  ErrorMessageSchema,
  SubmitResultSchema,
  type Transaction,
  type TransactionMessage,
  type SnapshotMessage,
  type ErrorMessage,
  type SubmitResult,
  type ServerBroadcast,
} from "./DocumentProtocol.js";

// =============================================================================
// WebSocket Handler
// =============================================================================

export {
  handleConnection,
  extractDocumentId,
  makeHandler as makeWebSocketHandler,
} from "./WebSocketHandler.js";

// =============================================================================
// Errors
// =============================================================================

export {
  DocumentTypeNotFoundError,
  DocumentNotFoundError,
  AuthenticationError,
  TransactionRejectedError,
  MessageParseError,
  InvalidConnectionError,
  MissingDocumentIdError,
  type MimicServerError,
} from "./errors.js";
