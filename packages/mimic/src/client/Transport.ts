import type * as Transaction from "../Transaction";

// =============================================================================
// Server Messages
// =============================================================================

/**
 * Message received when the server broadcasts a committed transaction.
 */
export interface TransactionMessage {
  readonly type: "transaction";
  readonly transaction: Transaction.Transaction;
  /** Server-assigned version number for ordering */
  readonly version: number;
}

/**
 * Message received when requesting or receiving a full state snapshot.
 */
export interface SnapshotMessage {
  readonly type: "snapshot";
  readonly state: unknown;
  readonly version: number;
}

/**
 * Message received when the server rejects a transaction.
 */
export interface ErrorMessage {
  readonly type: "error";
  readonly transactionId: string;
  readonly reason: string;
}

/**
 * Message received in response to a ping (heartbeat).
 */
export interface PongMessage {
  readonly type: "pong";
}

/**
 * Message received after authentication attempt.
 */
export interface AuthResultMessage {
  readonly type: "auth_result";
  readonly success: boolean;
  readonly error?: string;
}

/**
 * Union of all possible server messages.
 */
export type ServerMessage =
  | TransactionMessage
  | SnapshotMessage
  | ErrorMessage
  | PongMessage
  | AuthResultMessage;

// =============================================================================
// Client Messages
// =============================================================================

/**
 * Message sent to submit a transaction to the server.
 */
export interface SubmitTransactionMessage {
  readonly type: "submit";
  readonly transaction: Transaction.Transaction;
}

/**
 * Message sent to request a full state snapshot.
 */
export interface RequestSnapshotMessage {
  readonly type: "request_snapshot";
}

/**
 * Message sent as heartbeat ping.
 */
export interface PingMessage {
  readonly type: "ping";
}

/**
 * Message sent to authenticate with the server.
 */
export interface AuthMessage {
  readonly type: "auth";
  readonly token: string;
}

/**
 * Union of all possible client messages.
 */
export type ClientMessage =
  | SubmitTransactionMessage
  | RequestSnapshotMessage
  | PingMessage
  | AuthMessage;

// =============================================================================
// Encoded Message Types (for network transport)
// =============================================================================

/**
 * Encoded transaction message for network transport.
 */
export interface EncodedTransactionMessage {
  readonly type: "transaction";
  readonly transaction: Transaction.EncodedTransaction;
  readonly version: number;
}

/**
 * Encoded submit message for network transport.
 */
export interface EncodedSubmitTransactionMessage {
  readonly type: "submit";
  readonly transaction: Transaction.EncodedTransaction;
}

/**
 * Union of all possible encoded server messages (for network transport).
 */
export type EncodedServerMessage =
  | EncodedTransactionMessage
  | SnapshotMessage
  | ErrorMessage
  | PongMessage
  | AuthResultMessage;

/**
 * Union of all possible encoded client messages (for network transport).
 */
export type EncodedClientMessage =
  | EncodedSubmitTransactionMessage
  | RequestSnapshotMessage
  | PingMessage
  | AuthMessage;

// =============================================================================
// Transport Interface
// =============================================================================

/**
 * Abstract transport interface for server communication.
 * Implementations can use WebSocket, HTTP, or any other protocol.
 */
export interface Transport {
  /**
   * Sends a transaction to the server for processing.
   * @param transaction - The transaction to submit
   */
  readonly send: (transaction: Transaction.Transaction) => void;

  /**
   * Requests a full state snapshot from the server.
   * Used for initial sync or recovery from drift.
   */
  readonly requestSnapshot: () => void;

  /**
   * Subscribes to messages from the server.
   * @param handler - Callback invoked for each server message
   * @returns Unsubscribe function
   */
  readonly subscribe: (handler: (message: ServerMessage) => void) => () => void;

  /**
   * Establishes connection to the server.
   * @returns Promise that resolves when connected
   */
  readonly connect: () => Promise<void>;

  /**
   * Disconnects from the server.
   */
  readonly disconnect: () => void;

  /**
   * Returns whether the transport is currently connected.
   */
  readonly isConnected: () => boolean;
}

// =============================================================================
// Transport Events
// =============================================================================

/**
 * Events emitted by the transport for connection status.
 */
export type TransportEvent =
  | { type: "connected" }
  | { type: "disconnected"; reason?: string }
  | { type: "reconnecting"; attempt: number }
  | { type: "error"; error: Error };

/**
 * Handler for transport events.
 */
export type TransportEventHandler = (event: TransportEvent) => void;

// =============================================================================
// Transport Options
// =============================================================================

/**
 * Options for creating a transport.
 */
export interface TransportOptions {
  /** Handler for transport lifecycle events */
  readonly onEvent?: TransportEventHandler;
  /** Timeout in milliseconds for connection attempts */
  readonly connectionTimeout?: number;
  /** Whether to automatically reconnect on disconnect */
  readonly autoReconnect?: boolean;
  /** Maximum number of reconnection attempts */
  readonly maxReconnectAttempts?: number;
  /** Base delay between reconnection attempts (ms) */
  readonly reconnectDelay?: number;
}
