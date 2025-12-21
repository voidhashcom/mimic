/**
 * @voidhash/mimic-client
 * 
 * Optimistic client library for the Mimic sync engine.
 * Provides optimistic updates with server synchronization.
 * 
 * @since 0.0.1
 */

// =============================================================================
// Presence (re-exported from core for convenience)
// =============================================================================

export * as Presence from "../Presence.js";

// =============================================================================
// Main Client Document
// =============================================================================

export * as ClientDocument from "./ClientDocument.js";

// =============================================================================
// Transport Interface
// =============================================================================

export * as Transport from "./Transport.js";

// =============================================================================
// WebSocket Transport
// =============================================================================

export * as WebSocketTransport from "./WebSocketTransport.js";

// =============================================================================
// Rebase Logic
// =============================================================================

export * as Rebase from "./Rebase.js";

// =============================================================================
// State Monitoring
// =============================================================================

export * as StateMonitor from "./StateMonitor.js";

// =============================================================================
// Errors
// =============================================================================

export {
  MimicClientError,
  TransactionRejectedError,
  NotConnectedError,
  ConnectionError,
  StateDriftError,
  TransactionTimeoutError,
  RebaseError,
  InvalidStateError,
  WebSocketError,
  AuthenticationError,
} from "./errors.js";
