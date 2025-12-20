import * as Transaction from "../Transaction";

import * as Transport from "./Transport";
import { WebSocketError, AuthenticationError } from "./errors";

// =============================================================================
// WebSocket Transport Options
// =============================================================================

/**
 * Options for creating a WebSocket transport.
 */
export interface WebSocketTransportOptions extends Transport.TransportOptions {
  /** WebSocket URL (ws:// or wss://) - base URL without document path */
  readonly url: string;
  /** Document ID to connect to. Will be appended to URL as /doc/{documentId} */
  readonly documentId?: string;
  /** WebSocket subprotocols */
  readonly protocols?: string[];
  /** Authentication token or function that returns a token */
  readonly authToken?: string | (() => string | Promise<string>);
  /** Interval between heartbeat pings (ms). Default: 30000 */
  readonly heartbeatInterval?: number;
  /** Timeout to wait for pong response (ms). Default: 10000 */
  readonly heartbeatTimeout?: number;
  /** Maximum delay between reconnection attempts (ms). Default: 30000 */
  readonly maxReconnectDelay?: number;
}

// =============================================================================
// Connection State
// =============================================================================

type ConnectionState =
  | { type: "disconnected" }
  | { type: "connecting" }
  | { type: "authenticating" }
  | { type: "connected" }
  | { type: "reconnecting"; attempt: number };

// =============================================================================
// WebSocket Transport Implementation
// =============================================================================

/**
 * Creates a WebSocket-based transport for real-time server communication.
 */
/**
 * Build the WebSocket URL with optional document ID path.
 */
const buildWebSocketUrl = (baseUrl: string, documentId?: string): string => {
  if (!documentId) {
    return baseUrl;
  }
  // Remove trailing slash from base URL
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  // Encode the document ID for URL safety
  const encodedDocId = encodeURIComponent(documentId);
  return `${normalizedBase}/doc/${encodedDocId}`;
};

export const make = (options: WebSocketTransportOptions): Transport.Transport => {
  const {
    url: baseUrl,
    documentId,
    protocols,
    authToken,
    onEvent,
    connectionTimeout = 10000,
    autoReconnect = true,
    maxReconnectAttempts = 10,
    reconnectDelay = 1000,
    maxReconnectDelay = 30000,
    heartbeatInterval = 30000,
    heartbeatTimeout = 10000,
  } = options;

  // Build the full URL with document ID if provided
  const url = buildWebSocketUrl(baseUrl, documentId);

  // ==========================================================================
  // Internal State
  // ==========================================================================

  let _state: ConnectionState = { type: "disconnected" };
  let _ws: WebSocket | null = null;
  let _messageHandlers: Set<(message: Transport.ServerMessage) => void> = new Set();

  // Timers
  let _connectionTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let _heartbeatIntervalHandle: ReturnType<typeof setInterval> | null = null;
  let _heartbeatTimeoutHandle: ReturnType<typeof setTimeout> | null = null;
  let _reconnectTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

  // Message queue for messages sent while reconnecting
  let _messageQueue: Transport.ClientMessage[] = [];

  // Promise resolvers for connect()
  let _connectResolver: (() => void) | null = null;
  let _connectRejecter: ((error: Error) => void) | null = null;

  // Track reconnection attempt count (persists through connecting state)
  let _reconnectAttempt = 0;

  // ==========================================================================
  // Helper Functions
  // ==========================================================================

  const emit = (handler: Transport.TransportEventHandler | undefined, event: Parameters<Transport.TransportEventHandler>[0]) => {
    handler?.(event);
  };

  /**
   * Encodes a client message for network transport.
   */
  const encodeClientMessage = (message: Transport.ClientMessage): Transport.EncodedClientMessage => {
    if (message.type === "submit") {
      return {
        type: "submit",
        transaction: Transaction.encode(message.transaction),
      };
    }
    return message;
  };

  /**
   * Decodes a server message from network transport.
   */
  const decodeServerMessage = (encoded: Transport.EncodedServerMessage): Transport.ServerMessage => {
    if (encoded.type === "transaction") {
      return {
        type: "transaction",
        transaction: Transaction.decode(encoded.transaction),
        version: encoded.version,
      };
    }
    return encoded;
  };

  /**
   * Sends a raw message over the WebSocket.
   */
  const sendRaw = (message: Transport.ClientMessage): void => {
    if (_ws && _ws.readyState === WebSocket.OPEN) {
      _ws.send(JSON.stringify(encodeClientMessage(message)));
    }
  };

  /**
   * Clears all active timers.
   */
  const clearTimers = (): void => {
    if (_connectionTimeoutHandle) {
      clearTimeout(_connectionTimeoutHandle);
      _connectionTimeoutHandle = null;
    }
    if (_heartbeatIntervalHandle) {
      clearInterval(_heartbeatIntervalHandle);
      _heartbeatIntervalHandle = null;
    }
    if (_heartbeatTimeoutHandle) {
      clearTimeout(_heartbeatTimeoutHandle);
      _heartbeatTimeoutHandle = null;
    }
    if (_reconnectTimeoutHandle) {
      clearTimeout(_reconnectTimeoutHandle);
      _reconnectTimeoutHandle = null;
    }
  };

  /**
   * Starts the heartbeat mechanism.
   */
  const startHeartbeat = (): void => {
    stopHeartbeat();

    _heartbeatIntervalHandle = setInterval(() => {
      if (_state.type !== "connected") return;

      // Send ping
      sendRaw({ type: "ping" });

      // Set timeout for pong response
      _heartbeatTimeoutHandle = setTimeout(() => {
        // No pong received - connection is dead
        handleConnectionLost("Heartbeat timeout");
      }, heartbeatTimeout);
    }, heartbeatInterval);
  };

  /**
   * Stops the heartbeat mechanism.
   */
  const stopHeartbeat = (): void => {
    if (_heartbeatIntervalHandle) {
      clearInterval(_heartbeatIntervalHandle);
      _heartbeatIntervalHandle = null;
    }
    if (_heartbeatTimeoutHandle) {
      clearTimeout(_heartbeatTimeoutHandle);
      _heartbeatTimeoutHandle = null;
    }
  };

  /**
   * Handles pong response - clears the heartbeat timeout.
   */
  const handlePong = (): void => {
    if (_heartbeatTimeoutHandle) {
      clearTimeout(_heartbeatTimeoutHandle);
      _heartbeatTimeoutHandle = null;
    }
  };

  /**
   * Flushes the message queue after reconnection.
   */
  const flushMessageQueue = (): void => {
    const queue = _messageQueue;
    _messageQueue = [];
    for (const message of queue) {
      sendRaw(message);
    }
  };

  /**
   * Calculates reconnection delay with exponential backoff.
   */
  const getReconnectDelay = (attempt: number): number => {
    const delay = reconnectDelay * Math.pow(2, attempt);
    return Math.min(delay, maxReconnectDelay);
  };

  /**
   * Resolves the auth token (handles both string and function).
   * Returns empty string if no token is configured.
   */
  const resolveAuthToken = async (): Promise<string> => {
    if (!authToken) return "";
    if (typeof authToken === "string") return authToken;
    return authToken();
  };

  /**
   * Performs authentication after connection.
   * Always sends an auth message (even with empty token) to trigger server auth flow.
   */
  const authenticate = async (): Promise<void> => {
    const token = await resolveAuthToken();
    _state = { type: "authenticating" };
    sendRaw({ type: "auth", token });
  };

  /**
   * Handles authentication result from server.
   */
  const handleAuthResult = (success: boolean, error?: string): void => {
    if (!success) {
      const authError = new AuthenticationError(error || "Authentication failed");
      cleanup();
      _connectRejecter?.(authError);
      _connectResolver = null;
      _connectRejecter = null;
      emit(onEvent, { type: "error", error: authError });
      return;
    }

    // Auth successful - complete connection
    completeConnection();
  };

  /**
   * Completes the connection process.
   */
  const completeConnection = (): void => {
    _state = { type: "connected" };

    // Reset reconnection attempt counter on successful connection
    _reconnectAttempt = 0;

    // Clear connection timeout
    if (_connectionTimeoutHandle) {
      clearTimeout(_connectionTimeoutHandle);
      _connectionTimeoutHandle = null;
    }

    // Start heartbeat
    startHeartbeat();

    // Flush any queued messages
    flushMessageQueue();

    // Resolve connect promise
    _connectResolver?.();
    _connectResolver = null;
    _connectRejecter = null;

    emit(onEvent, { type: "connected" });
  };

  /**
   * Cleans up WebSocket and related state.
   */
  const cleanup = (): void => {
    clearTimers();

    if (_ws) {
      // Remove listeners to prevent callbacks
      _ws.onopen = null;
      _ws.onclose = null;
      _ws.onerror = null;
      _ws.onmessage = null;
      
      if (_ws.readyState === WebSocket.OPEN || _ws.readyState === WebSocket.CONNECTING) {
        _ws.close();
      }
      _ws = null;
    }
  };

  /**
   * Handles connection lost - initiates reconnection if enabled.
   */
  const handleConnectionLost = (reason?: string): void => {
    cleanup();

    if (_state.type === "disconnected") return;

    const wasInitialConnect = _connectRejecter !== null;

    if (wasInitialConnect) {
      // Failed during initial connection
      _state = { type: "disconnected" };
      _reconnectAttempt = 0;
      _connectRejecter!(new WebSocketError("Connection failed", undefined, reason));
      _connectResolver = null;
      _connectRejecter = null;
      emit(onEvent, { type: "disconnected", reason });
      return;
    }

    if (!autoReconnect) {
      _state = { type: "disconnected" };
      _reconnectAttempt = 0;
      emit(onEvent, { type: "disconnected", reason });
      return;
    }

    _reconnectAttempt++;

    if (_reconnectAttempt > maxReconnectAttempts) {
      _state = { type: "disconnected" };
      _reconnectAttempt = 0;
      emit(onEvent, { type: "disconnected", reason: "Max reconnection attempts reached" });
      return;
    }

    // Enter reconnecting state
    _state = { type: "reconnecting", attempt: _reconnectAttempt };
    emit(onEvent, { type: "reconnecting", attempt: _reconnectAttempt });

    // Schedule reconnection
    const delay = getReconnectDelay(_reconnectAttempt - 1);
    _reconnectTimeoutHandle = setTimeout(() => {
      _reconnectTimeoutHandle = null;
      attemptConnection();
    }, delay);
  };

  /**
   * Attempts to establish WebSocket connection.
   */
  const attemptConnection = (): void => {
    if (_state.type === "connected") return;

    _state = { type: "connecting" };

    try {
      _ws = new WebSocket(url, protocols);
    } catch (error) {
      handleConnectionLost((error as Error).message);
      return;
    }

    // Set connection timeout
    _connectionTimeoutHandle = setTimeout(() => {
      _connectionTimeoutHandle = null;
      handleConnectionLost("Connection timeout");
    }, connectionTimeout);

    _ws.onopen = async () => {
      // Clear connection timeout
      if (_connectionTimeoutHandle) {
        clearTimeout(_connectionTimeoutHandle);
        _connectionTimeoutHandle = null;
      }

      try {
        // Always authenticate (even with empty token) to trigger server auth flow
        await authenticate();
        // Connection completes after auth_result is received
      } catch (error) {
        handleConnectionLost((error as Error).message);
      }
    };

    _ws.onclose = (event) => {
      handleConnectionLost(event.reason || `Connection closed (code: ${event.code})`);
    };

    _ws.onerror = () => {
      // Error details come through onclose
    };

    _ws.onmessage = (event) => {
      try {
        const encoded = JSON.parse(event.data as string) as Transport.EncodedServerMessage;
        const message = decodeServerMessage(encoded);
        handleMessage(message);
      } catch {
        // Invalid message - ignore
      }
    };
  };

  /**
   * Handles incoming server messages.
   */
  const handleMessage = (message: Transport.ServerMessage): void => {
    // Handle internal messages
    if (message.type === "pong") {
      handlePong();
      return;
    }

    if (message.type === "auth_result") {
      handleAuthResult(message.success, message.error);
      return;
    }

    // Forward to subscribers
    for (const handler of _messageHandlers) {
      try {
        handler(message);
      } catch {
        // Ignore handler errors
      }
    }
  };

  // ==========================================================================
  // Public API
  // ==========================================================================

  const transport: Transport.Transport = {
    send: (transaction: Transaction.Transaction): void => {
      const message: Transport.ClientMessage = { type: "submit", transaction };

      if (_state.type === "connected") {
        sendRaw(message);
      } else if (_state.type === "reconnecting") {
        // Queue message for when we reconnect
        _messageQueue.push(message);
      }
      // If disconnected, silently drop (caller should check isConnected)
    },

    requestSnapshot: (): void => {
      const message: Transport.ClientMessage = { type: "request_snapshot" };

      if (_state.type === "connected") {
        sendRaw(message);
      } else if (_state.type === "reconnecting") {
        _messageQueue.push(message);
      }
    },

    subscribe: (handler: (message: Transport.ServerMessage) => void): (() => void) => {
      _messageHandlers.add(handler);
      return () => {
        _messageHandlers.delete(handler);
      };
    },

    connect: async (): Promise<void> => {
      if (_state.type === "connected") {
        return;
      }

      if (_state.type === "connecting" || _state.type === "authenticating") {
        // Already connecting - wait for existing promise
        return new Promise((resolve, reject) => {
          const existingResolver = _connectResolver;
          const existingRejecter = _connectRejecter;
          _connectResolver = () => {
            existingResolver?.();
            resolve();
          };
          _connectRejecter = (error) => {
            existingRejecter?.(error);
            reject(error);
          };
        });
      }

      return new Promise((resolve, reject) => {
        _connectResolver = resolve;
        _connectRejecter = reject;
        attemptConnection();
      });
    },

    disconnect: (): void => {
      // Cancel any pending reconnection
      if (_reconnectTimeoutHandle) {
        clearTimeout(_reconnectTimeoutHandle);
        _reconnectTimeoutHandle = null;
      }

      // Reject any pending connect promise
      if (_connectRejecter) {
        _connectRejecter(new WebSocketError("Disconnected by user"));
        _connectResolver = null;
        _connectRejecter = null;
      }

      // Clean up
      cleanup();
      _state = { type: "disconnected" };
      _reconnectAttempt = 0;
      _messageQueue = [];

      emit(onEvent, { type: "disconnected", reason: "User disconnected" });
    },

    isConnected: (): boolean => {
      return _state.type === "connected";
    },
  };

  return transport;
};
