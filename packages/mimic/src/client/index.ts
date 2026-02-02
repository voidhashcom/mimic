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

export * as Presence from "../Presence";

// =============================================================================
// Main Client Document
// =============================================================================

export * as ClientDocument from "./ClientDocument";
export type { DraftHandle } from "./ClientDocument";

// =============================================================================
// Transport Interface
// =============================================================================

export * as Transport from "./Transport";

// =============================================================================
// WebSocket Transport
// =============================================================================

export * as WebSocketTransport from "./WebSocketTransport";

// =============================================================================
// Rebase Logic
// =============================================================================

export * as Rebase from "./Rebase";

// =============================================================================
// State Monitoring
// =============================================================================

export * as StateMonitor from "./StateMonitor";

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
} from "./errors";
