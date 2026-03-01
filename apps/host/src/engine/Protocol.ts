import { Effect } from "effect";
import { Transaction } from "@voidhash/mimic";
import { MessageParseError } from "./Errors";

// Client -> Server Messages

export interface AuthMessage {
  readonly type: "auth";
  readonly token: string;
}

export interface PingMessage {
  readonly type: "ping";
}

export interface SubmitMessage {
  readonly type: "submit";
  readonly transaction: Transaction.Transaction;
}

export interface RequestSnapshotMessage {
  readonly type: "request_snapshot";
}

export interface PresenceSetMessage {
  readonly type: "presence_set";
  readonly data: unknown;
}

export interface PresenceClearMessage {
  readonly type: "presence_clear";
}

export type ClientMessage =
  | AuthMessage
  | PingMessage
  | SubmitMessage
  | RequestSnapshotMessage
  | PresenceSetMessage
  | PresenceClearMessage;

// Server -> Client Messages

export type Permission = "read" | "write";

export interface PresenceEntry {
  readonly data: unknown;
  readonly userId?: string;
}

export interface AuthResultMessage {
  readonly type: "auth_result";
  readonly success: boolean;
  readonly error?: string;
  readonly userId?: string;
  readonly permission?: Permission;
}

export interface PongMessage {
  readonly type: "pong";
}

export interface TransactionMessage {
  readonly type: "transaction";
  readonly transaction: Transaction.Transaction;
  readonly version: number;
}

export interface SnapshotMessage {
  readonly type: "snapshot";
  readonly state: unknown;
  readonly version: number;
}

export interface ErrorMessage {
  readonly type: "error";
  readonly transactionId: string;
  readonly reason: string;
}

export interface PresenceUpdateMessage {
  readonly type: "presence_update";
  readonly id: string;
  readonly data: unknown;
  readonly userId?: string;
}

export interface PresenceRemoveMessage {
  readonly type: "presence_remove";
  readonly id: string;
}

export interface PresenceSnapshotMessage {
  readonly type: "presence_snapshot";
  readonly selfId: string;
  readonly presences: Record<string, PresenceEntry>;
}

export type ServerMessage =
  | AuthResultMessage
  | PongMessage
  | TransactionMessage
  | SnapshotMessage
  | ErrorMessage
  | PresenceUpdateMessage
  | PresenceRemoveMessage
  | PresenceSnapshotMessage;

export type ServerBroadcast = TransactionMessage | ErrorMessage;

// Encoding / Decoding

interface EncodedClientMessage {
  readonly type: string;
  readonly token?: string;
  readonly transaction?: Transaction.EncodedTransaction;
  readonly data?: unknown;
}

const decodeClientMessage = (encoded: EncodedClientMessage): ClientMessage => {
  if (encoded.type === "submit" && encoded.transaction) {
    return {
      type: "submit",
      transaction: Transaction.decode(encoded.transaction),
    };
  }
  return encoded as ClientMessage;
};

export const encodeServerMessage = (message: ServerMessage): string => {
  if (message.type === "transaction") {
    return JSON.stringify({
      type: "transaction",
      transaction: Transaction.encode(message.transaction),
      version: message.version,
    });
  }
  return JSON.stringify(message);
};

export const parseClientMessage = (
  data: string | ArrayBuffer | Uint8Array,
): Effect.Effect<ClientMessage, MessageParseError> =>
  Effect.try({
    try: () => {
      const text =
        typeof data === "string"
          ? data
          : new TextDecoder().decode(data instanceof ArrayBuffer ? new Uint8Array(data) : data);
      const encoded = JSON.parse(text) as EncodedClientMessage;
      return decodeClientMessage(encoded);
    },
    catch: (cause) => new MessageParseError({ cause }),
  });

// Message Constructors

export const authResultSuccess = (userId: string, permission: Permission): AuthResultMessage => ({
  type: "auth_result",
  success: true,
  userId,
  permission,
});

export const authResultFailure = (error: string): AuthResultMessage => ({
  type: "auth_result",
  success: false,
  error,
});

export const pong = (): PongMessage => ({ type: "pong" });

export const transactionMessage = (
  transaction: Transaction.Transaction,
  version: number,
): TransactionMessage => ({
  type: "transaction",
  transaction,
  version,
});

export const snapshotMessage = (state: unknown, version: number): SnapshotMessage => ({
  type: "snapshot",
  state,
  version,
});

export const errorMessage = (transactionId: string, reason: string): ErrorMessage => ({
  type: "error",
  transactionId,
  reason,
});

export const presenceUpdateMessage = (id: string, data: unknown, userId?: string): PresenceUpdateMessage => ({
  type: "presence_update",
  id,
  data,
  userId,
});

export const presenceRemoveMessage = (id: string): PresenceRemoveMessage => ({
  type: "presence_remove",
  id,
});

export const presenceSnapshotMessage = (
  selfId: string,
  presences: Record<string, PresenceEntry>,
): PresenceSnapshotMessage => ({
  type: "presence_snapshot",
  selfId,
  presences,
});
