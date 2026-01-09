/**
 * @voidhash/mimic-effect - WebSocket Protocol
 *
 * Message types and encoding/decoding for WebSocket communication.
 */
import { Effect } from "effect";
import { Transaction } from "@voidhash/mimic";
import type { Permission, PresenceEntry } from "./Types";
import { MessageParseError } from "./Errors";

// =============================================================================
// Client -> Server Messages
// =============================================================================

/**
 * Authentication request
 */
export interface AuthMessage {
  readonly type: "auth";
  readonly token: string;
}

/**
 * Heartbeat ping
 */
export interface PingMessage {
  readonly type: "ping";
}

/**
 * Submit a transaction
 */
export interface SubmitMessage {
  readonly type: "submit";
  readonly transaction: Transaction.Transaction;
}

/**
 * Request current document snapshot
 */
export interface RequestSnapshotMessage {
  readonly type: "request_snapshot";
}

/**
 * Set presence data
 */
export interface PresenceSetMessage {
  readonly type: "presence_set";
  readonly data: unknown;
}

/**
 * Clear presence data
 */
export interface PresenceClearMessage {
  readonly type: "presence_clear";
}

/**
 * Union of all client messages
 */
export type ClientMessage =
  | AuthMessage
  | PingMessage
  | SubmitMessage
  | RequestSnapshotMessage
  | PresenceSetMessage
  | PresenceClearMessage;

// =============================================================================
// Server -> Client Messages
// =============================================================================

/**
 * Authentication result
 */
export interface AuthResultMessage {
  readonly type: "auth_result";
  readonly success: boolean;
  readonly error?: string;
  readonly userId?: string;
  readonly permission?: Permission;
}

/**
 * Heartbeat pong
 */
export interface PongMessage {
  readonly type: "pong";
}

/**
 * Transaction broadcast
 */
export interface TransactionMessage {
  readonly type: "transaction";
  readonly transaction: Transaction.Transaction;
  readonly version: number;
}

/**
 * Document snapshot
 */
export interface SnapshotMessage {
  readonly type: "snapshot";
  readonly state: unknown;
  readonly version: number;
}

/**
 * Transaction error
 */
export interface ErrorMessage {
  readonly type: "error";
  readonly transactionId: string;
  readonly reason: string;
}

/**
 * Presence update broadcast
 */
export interface PresenceUpdateMessage {
  readonly type: "presence_update";
  readonly id: string;
  readonly data: unknown;
  readonly userId?: string;
}

/**
 * Presence removal broadcast
 */
export interface PresenceRemoveMessage {
  readonly type: "presence_remove";
  readonly id: string;
}

/**
 * Presence snapshot (sent after auth)
 */
export interface PresenceSnapshotMessage {
  readonly type: "presence_snapshot";
  readonly selfId: string;
  readonly presences: Record<string, PresenceEntry>;
}

/**
 * Union of all server messages
 */
export type ServerMessage =
  | AuthResultMessage
  | PongMessage
  | TransactionMessage
  | SnapshotMessage
  | ErrorMessage
  | PresenceUpdateMessage
  | PresenceRemoveMessage
  | PresenceSnapshotMessage;

/**
 * Server broadcast messages (transaction or error)
 */
export type ServerBroadcast = TransactionMessage | ErrorMessage;

// =============================================================================
// Encoded Types (for wire format)
// =============================================================================

/**
 * Encoded client message (with encoded transaction)
 */
export interface EncodedClientMessage {
  readonly type: string;
  readonly token?: string;
  readonly transaction?: Transaction.EncodedTransaction;
  readonly data?: unknown;
}

/**
 * Encoded server message (with encoded transaction)
 */
export interface EncodedServerMessage {
  readonly type: string;
  readonly success?: boolean;
  readonly error?: string;
  readonly userId?: string;
  readonly permission?: Permission;
  readonly transaction?: Transaction.EncodedTransaction;
  readonly version?: number;
  readonly state?: unknown;
  readonly transactionId?: string;
  readonly reason?: string;
  readonly id?: string;
  readonly data?: unknown;
  readonly selfId?: string;
  readonly presences?: Record<string, PresenceEntry>;
}

// =============================================================================
// Encoding/Decoding Functions
// =============================================================================

/**
 * Decode an encoded client message to a ClientMessage
 */
export const decodeClientMessage = (
  encoded: EncodedClientMessage
): ClientMessage => {
  if (encoded.type === "submit" && encoded.transaction) {
    return {
      type: "submit",
      transaction: Transaction.decode(encoded.transaction),
    };
  }
  return encoded as ClientMessage;
};

/**
 * Encode a server message for wire format
 */
export const encodeServerMessage = (message: ServerMessage): string => {
  if (message.type === "transaction") {
    const encoded: EncodedServerMessage = {
      type: "transaction",
      transaction: Transaction.encode(message.transaction),
      version: message.version,
    };
    return JSON.stringify(encoded);
  }
  return JSON.stringify(message);
};

/**
 * Parse a raw WebSocket message to a ClientMessage
 */
export const parseClientMessage = (
  data: string | ArrayBuffer | Uint8Array
): Effect.Effect<ClientMessage, MessageParseError> =>
  Effect.try({
    try: () => {
      const text =
        typeof data === "string"
          ? data
          : new TextDecoder().decode(
              data instanceof ArrayBuffer ? new Uint8Array(data) : data
            );
      const encoded = JSON.parse(text) as EncodedClientMessage;
      return decodeClientMessage(encoded);
    },
    catch: (cause) => new MessageParseError({ cause }),
  });

/**
 * Create an auth result success message
 */
export const authResultSuccess = (
  userId: string,
  permission: Permission
): AuthResultMessage => ({
  type: "auth_result",
  success: true,
  userId,
  permission,
});

/**
 * Create an auth result failure message
 */
export const authResultFailure = (error: string): AuthResultMessage => ({
  type: "auth_result",
  success: false,
  error,
});

/**
 * Create a pong message
 */
export const pong = (): PongMessage => ({ type: "pong" });

/**
 * Create a transaction message
 */
export const transactionMessage = (
  transaction: Transaction.Transaction,
  version: number
): TransactionMessage => ({
  type: "transaction",
  transaction,
  version,
});

/**
 * Create a snapshot message
 */
export const snapshotMessage = (
  state: unknown,
  version: number
): SnapshotMessage => ({
  type: "snapshot",
  state,
  version,
});

/**
 * Create an error message
 */
export const errorMessage = (
  transactionId: string,
  reason: string
): ErrorMessage => ({
  type: "error",
  transactionId,
  reason,
});

/**
 * Create a presence update message
 */
export const presenceUpdateMessage = (
  id: string,
  data: unknown,
  userId?: string
): PresenceUpdateMessage => ({
  type: "presence_update",
  id,
  data,
  userId,
});

/**
 * Create a presence remove message
 */
export const presenceRemoveMessage = (
  id: string
): PresenceRemoveMessage => ({
  type: "presence_remove",
  id,
});

/**
 * Create a presence snapshot message
 */
export const presenceSnapshotMessage = (
  selfId: string,
  presences: Record<string, PresenceEntry>
): PresenceSnapshotMessage => ({
  type: "presence_snapshot",
  selfId,
  presences,
});
