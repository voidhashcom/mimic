import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as Transaction from "../../src/Transaction";
import * as OperationPath from "../../src/OperationPath";
import * as WebSocketTransport from "../../src/client/WebSocketTransport";
import type * as Transport from "../../src/client/Transport";

// =============================================================================
// Mock CloseEvent (not available in Node.js)
// =============================================================================

class MockCloseEvent extends Event {
  readonly code: number;
  readonly reason: string;
  readonly wasClean: boolean;

  constructor(type: string, init?: { code?: number; reason?: string; wasClean?: boolean }) {
    super(type);
    this.code = init?.code ?? 1000;
    this.reason = init?.reason ?? "";
    this.wasClean = init?.wasClean ?? true;
  }
}

// =============================================================================
// Mock WebSocket
// =============================================================================

type MockWebSocketEventHandler = ((event: Event) => void) | null;
type MockMessageHandler = ((event: MessageEvent) => void) | null;
type MockCloseHandler = ((event: MockCloseEvent) => void) | null;

class MockWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  url: string;
  protocols: string | string[] | undefined;
  readyState: number = MockWebSocket.CONNECTING;

  onopen: MockWebSocketEventHandler = null;
  onclose: MockCloseHandler = null;
  onerror: MockWebSocketEventHandler = null;
  onmessage: MockMessageHandler = null;

  sentMessages: string[] = [];
  static instances: MockWebSocket[] = [];

  constructor(url: string, protocols?: string | string[]) {
    this.url = url;
    this.protocols = protocols;
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(code?: number, reason?: string): void {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      const event = new MockCloseEvent("close", { code: code ?? 1000, reason: reason ?? "" });
      this.onclose(event);
    }
  }

  // Test helpers
  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    if (this.onopen) {
      this.onopen(new Event("open"));
    }
  }

  /**
   * Simulates a complete connection: opens the socket and sends auth_result
   * after the transport sends the auth message.
   * This is needed because the transport always sends an auth message on open
   * and waits for auth_result before completing the connection.
   * 
   * Returns a Promise that resolves after auth is simulated.
   */
  simulateOpenWithAuth(): Promise<void> {
    this.simulateOpen();
    // The onopen handler is async and sends auth message
    // We need to wait for it, then send auth_result
    // Use Promise.resolve().then() to ensure we run after the microtask queue
    return Promise.resolve().then(() => Promise.resolve()).then(() => {
      this.simulateMessage({ type: "auth_result", success: true });
    });
  }

  simulateMessage(data: unknown): void {
    if (this.onmessage) {
      this.onmessage(new MessageEvent("message", { data: JSON.stringify(data) }));
    }
  }

  simulateClose(code = 1000, reason = ""): void {
    this.readyState = MockWebSocket.CLOSED;
    if (this.onclose) {
      this.onclose(new MockCloseEvent("close", { code, reason }));
    }
  }

  simulateError(): void {
    if (this.onerror) {
      this.onerror(new Event("error"));
    }
  }

  static reset(): void {
    MockWebSocket.instances = [];
  }

  static getLatest(): MockWebSocket | undefined {
    return MockWebSocket.instances[MockWebSocket.instances.length - 1];
  }
}

// Set up global mock
const originalWebSocket = globalThis.WebSocket;

beforeEach(() => {
  MockWebSocket.reset();
  // @ts-expect-error - Mocking global WebSocket
  globalThis.WebSocket = MockWebSocket;
  vi.useFakeTimers();
});

afterEach(() => {
  globalThis.WebSocket = originalWebSocket;
  vi.useRealTimers();
});

// =============================================================================
// WebSocketTransport Tests
// =============================================================================

describe("WebSocketTransport", () => {
  describe("make", () => {
    it("should create a transport with default options", () => {
      const transport = WebSocketTransport.make({
        url: "ws://localhost:8080",
      });

      expect(transport.isConnected()).toBe(false);
    });
  });

  describe("connect", () => {
    it("should establish connection to WebSocket server", async () => {
      const transport = WebSocketTransport.make({
        url: "ws://localhost:8080",
      });

      const connectPromise = transport.connect();

      // Simulate WebSocket open
      const ws = MockWebSocket.getLatest()!;
      await ws.simulateOpenWithAuth();

      await connectPromise;

      expect(transport.isConnected()).toBe(true);
      expect(ws.url).toBe("ws://localhost:8080");
    });

    it("should pass protocols to WebSocket", async () => {
      const transport = WebSocketTransport.make({
        url: "ws://localhost:8080",
        protocols: ["mimic-v1"],
      });

      transport.connect();

      const ws = MockWebSocket.getLatest()!;
      expect(ws.protocols).toEqual(["mimic-v1"]);
    });

    it("should emit connected event", async () => {
      let connectedEmitted = false;

      const transport = WebSocketTransport.make({
        url: "ws://localhost:8080",
        onEvent: (event) => {
          if (event.type === "connected") {
            connectedEmitted = true;
          }
        },
      });

      const connectPromise = transport.connect();
      await MockWebSocket.getLatest()!.simulateOpenWithAuth();
      await connectPromise;

      expect(connectedEmitted).toBe(true);
    });

    it("should reject on connection timeout", async () => {
      const transport = WebSocketTransport.make({
        url: "ws://localhost:8080",
        connectionTimeout: 1000,
      });

      const connectPromise = transport.connect();

      // Advance time past timeout
      vi.advanceTimersByTime(1001);

      await expect(connectPromise).rejects.toThrow("Connection failed");
    });

    it("should return immediately if already connected", async () => {
      const transport = WebSocketTransport.make({
        url: "ws://localhost:8080",
      });

      const connectPromise = transport.connect();
      await MockWebSocket.getLatest()!.simulateOpenWithAuth();
      await connectPromise;

      // Should return immediately
      await transport.connect();
      expect(MockWebSocket.instances.length).toBe(1);
    });
  });

  describe("disconnect", () => {
    it("should close WebSocket connection", async () => {
      const transport = WebSocketTransport.make({
        url: "ws://localhost:8080",
      });

      const connectPromise = transport.connect();
      await MockWebSocket.getLatest()!.simulateOpenWithAuth();
      await connectPromise;

      transport.disconnect();

      expect(transport.isConnected()).toBe(false);
    });

    it("should emit disconnected event", async () => {
      let disconnectedReason: string | undefined;

      const transport = WebSocketTransport.make({
        url: "ws://localhost:8080",
        onEvent: (event) => {
          if (event.type === "disconnected") {
            disconnectedReason = event.reason;
          }
        },
      });

      const connectPromise = transport.connect();
      await MockWebSocket.getLatest()!.simulateOpenWithAuth();
      await connectPromise;

      transport.disconnect();

      expect(disconnectedReason).toBe("User disconnected");
    });

    it("should reject pending connect promise", async () => {
      const transport = WebSocketTransport.make({
        url: "ws://localhost:8080",
      });

      const connectPromise = transport.connect();

      // Disconnect while connecting
      transport.disconnect();

      await expect(connectPromise).rejects.toThrow("Disconnected by user");
    });
  });

  describe("send", () => {
    it("should send transaction as JSON", async () => {
      const transport = WebSocketTransport.make({
        url: "ws://localhost:8080",
      });

      const connectPromise = transport.connect();
      const ws = MockWebSocket.getLatest()!;
      await ws.simulateOpenWithAuth();
      await connectPromise;

      const tx = Transaction.make([
        {
          kind: "string.set" as const,
          path: OperationPath.make("title"),
          payload: "test",
        },
      ]);

      transport.send(tx);

      // 2 messages: auth + submit
      expect(ws.sentMessages.length).toBe(2);
      const authMsg = JSON.parse(ws.sentMessages[0]!);
      expect(authMsg.type).toBe("auth");
      const sent = JSON.parse(ws.sentMessages[1]!);
      expect(sent.type).toBe("submit");
      expect(sent.transaction.id).toBe(tx.id);
    });

    it("should queue messages during reconnection", async () => {
      const transport = WebSocketTransport.make({
        url: "ws://localhost:8080",
        autoReconnect: true,
      });

      const connectPromise = transport.connect();
      const ws = MockWebSocket.getLatest()!;
      await ws.simulateOpenWithAuth();
      await connectPromise;

      // Simulate connection lost
      ws.simulateClose(1006, "Connection lost");

      // Queue message during reconnection
      const tx = Transaction.make([
        {
          kind: "string.set" as const,
          path: OperationPath.make("title"),
          payload: "queued",
        },
      ]);
      transport.send(tx);

      // Reconnect
      vi.advanceTimersByTime(1000);
      const newWs = MockWebSocket.getLatest()!;
      await newWs.simulateOpenWithAuth();

      // Queued message should be sent after auth
      // 2 messages: auth + submit (queued message)
      expect(newWs.sentMessages.length).toBe(2);
      const authMsg = JSON.parse(newWs.sentMessages[0]!);
      expect(authMsg.type).toBe("auth");
      const sent = JSON.parse(newWs.sentMessages[1]!);
      expect(sent.type).toBe("submit");
    });
  });

  describe("requestSnapshot", () => {
    it("should send snapshot request as JSON", async () => {
      const transport = WebSocketTransport.make({
        url: "ws://localhost:8080",
      });

      const connectPromise = transport.connect();
      const ws = MockWebSocket.getLatest()!;
      await ws.simulateOpenWithAuth();
      await connectPromise;

      transport.requestSnapshot();

      // 2 messages: auth + request_snapshot
      expect(ws.sentMessages.length).toBe(2);
      const authMsg = JSON.parse(ws.sentMessages[0]!);
      expect(authMsg.type).toBe("auth");
      const sent = JSON.parse(ws.sentMessages[1]!);
      expect(sent.type).toBe("request_snapshot");
    });
  });

  describe("subscribe", () => {
    it("should forward server messages to handlers", async () => {
      const transport = WebSocketTransport.make({
        url: "ws://localhost:8080",
      });

      const messages: Transport.ServerMessage[] = [];
      transport.subscribe((msg) => messages.push(msg));

      const connectPromise = transport.connect();
      const ws = MockWebSocket.getLatest()!;
      await ws.simulateOpenWithAuth();
      await connectPromise;

      ws.simulateMessage({
        type: "transaction",
        transaction: { id: "tx-1", ops: [], timestamp: Date.now() },
        version: 1,
      });

      expect(messages.length).toBe(1);
      expect(messages[0]!.type).toBe("transaction");
    });

    it("should allow unsubscribing", async () => {
      const transport = WebSocketTransport.make({
        url: "ws://localhost:8080",
      });

      const messages: Transport.ServerMessage[] = [];
      const unsubscribe = transport.subscribe((msg) => messages.push(msg));

      const connectPromise = transport.connect();
      const ws = MockWebSocket.getLatest()!;
      await ws.simulateOpenWithAuth();
      await connectPromise;

      unsubscribe();

      ws.simulateMessage({
        type: "snapshot",
        state: {},
        version: 1,
      });

      expect(messages.length).toBe(0);
    });
  });

  describe("reconnection", () => {
    it("should automatically reconnect on connection lost", async () => {
      let reconnectingAttempt = 0;

      const transport = WebSocketTransport.make({
        url: "ws://localhost:8080",
        autoReconnect: true,
        reconnectDelay: 1000,
        onEvent: (event) => {
          if (event.type === "reconnecting") {
            reconnectingAttempt = event.attempt;
          }
        },
      });

      const connectPromise = transport.connect();
      const ws = MockWebSocket.getLatest()!;
      await ws.simulateOpenWithAuth();
      await connectPromise;

      // Simulate connection lost
      ws.simulateClose(1006, "Connection lost");

      expect(reconnectingAttempt).toBe(1);

      // Advance time to trigger reconnect
      vi.advanceTimersByTime(1000);

      // Should have created new WebSocket
      expect(MockWebSocket.instances.length).toBe(2);

      // Complete reconnection (needs auth too)
      await MockWebSocket.getLatest()!.simulateOpenWithAuth();

      expect(transport.isConnected()).toBe(true);
    });

    it("should use exponential backoff for reconnection", async () => {
      const transport = WebSocketTransport.make({
        url: "ws://localhost:8080",
        autoReconnect: true,
        reconnectDelay: 1000,
        maxReconnectDelay: 30000,
      });

      const connectPromise = transport.connect();
      await MockWebSocket.getLatest()!.simulateOpenWithAuth();
      await connectPromise;

      // First disconnection
      MockWebSocket.getLatest()!.simulateClose();

      // First retry after 1s (1000 * 2^0)
      vi.advanceTimersByTime(999);
      expect(MockWebSocket.instances.length).toBe(1);
      vi.advanceTimersByTime(1);
      expect(MockWebSocket.instances.length).toBe(2);

      // Fail again
      MockWebSocket.getLatest()!.simulateClose();

      // Second retry after 2s (1000 * 2^1)
      vi.advanceTimersByTime(1999);
      expect(MockWebSocket.instances.length).toBe(2);
      vi.advanceTimersByTime(1);
      expect(MockWebSocket.instances.length).toBe(3);
    });

    it("should stop reconnecting after max attempts", async () => {
      let finalDisconnectReason: string | undefined;

      const transport = WebSocketTransport.make({
        url: "ws://localhost:8080",
        autoReconnect: true,
        maxReconnectAttempts: 2,
        reconnectDelay: 100,
        onEvent: (event) => {
          if (event.type === "disconnected") {
            finalDisconnectReason = event.reason;
          }
        },
      });

      const connectPromise = transport.connect();
      await MockWebSocket.getLatest()!.simulateOpenWithAuth();
      await connectPromise;

      // First disconnection
      MockWebSocket.getLatest()!.simulateClose();
      vi.advanceTimersByTime(100);
      MockWebSocket.getLatest()!.simulateClose();
      vi.advanceTimersByTime(200);
      MockWebSocket.getLatest()!.simulateClose();

      // Should have given up after 2 attempts
      expect(finalDisconnectReason).toBe("Max reconnection attempts reached");
    });

    it("should not reconnect when autoReconnect is false", async () => {
      let disconnected = false;

      const transport = WebSocketTransport.make({
        url: "ws://localhost:8080",
        autoReconnect: false,
        onEvent: (event) => {
          if (event.type === "disconnected") {
            disconnected = true;
          }
        },
      });

      const connectPromise = transport.connect();
      await MockWebSocket.getLatest()!.simulateOpenWithAuth();
      await connectPromise;

      MockWebSocket.getLatest()!.simulateClose();

      // Advance time - should not reconnect
      vi.advanceTimersByTime(10000);

      expect(MockWebSocket.instances.length).toBe(1);
      expect(disconnected).toBe(true);
    });
  });

  describe("heartbeat", () => {
    it("should send ping at configured interval", async () => {
      const transport = WebSocketTransport.make({
        url: "ws://localhost:8080",
        heartbeatInterval: 5000,
      });

      const connectPromise = transport.connect();
      const ws = MockWebSocket.getLatest()!;
      await ws.simulateOpenWithAuth();
      await connectPromise;

      // Advance time to trigger heartbeat
      vi.advanceTimersByTime(5000);

      // 2 messages: auth + ping
      expect(ws.sentMessages.length).toBe(2);
      const authMsg = JSON.parse(ws.sentMessages[0]!);
      expect(authMsg.type).toBe("auth");
      const sent = JSON.parse(ws.sentMessages[1]!);
      expect(sent.type).toBe("ping");
    });

    it("should handle pong response", async () => {
      const transport = WebSocketTransport.make({
        url: "ws://localhost:8080",
        heartbeatInterval: 5000,
        heartbeatTimeout: 2000,
      });

      const connectPromise = transport.connect();
      const ws = MockWebSocket.getLatest()!;
      await ws.simulateOpenWithAuth();
      await connectPromise;

      // Trigger heartbeat
      vi.advanceTimersByTime(5000);

      // Respond with pong
      ws.simulateMessage({ type: "pong" });

      // Advance past timeout - should not disconnect
      vi.advanceTimersByTime(3000);

      expect(transport.isConnected()).toBe(true);
    });

    it("should trigger reconnection on heartbeat timeout", async () => {
      let reconnecting = false;

      const transport = WebSocketTransport.make({
        url: "ws://localhost:8080",
        autoReconnect: true,
        heartbeatInterval: 5000,
        heartbeatTimeout: 2000,
        onEvent: (event) => {
          if (event.type === "reconnecting") {
            reconnecting = true;
          }
        },
      });

      const connectPromise = transport.connect();
      const ws = MockWebSocket.getLatest()!;
      await ws.simulateOpenWithAuth();
      await connectPromise;

      // Trigger heartbeat
      vi.advanceTimersByTime(5000);

      // No pong response - wait for timeout
      vi.advanceTimersByTime(2000);

      expect(reconnecting).toBe(true);
    });
  });

  describe("authentication", () => {
    it("should send auth message after connection with string token", async () => {
      const transport = WebSocketTransport.make({
        url: "ws://localhost:8080",
        authToken: "test-token-123",
      });

      const connectPromise = transport.connect();
      const ws = MockWebSocket.getLatest()!;
      // Use simulateOpen() only - we want to test auth manually
      ws.simulateOpen();

      // Should send auth message
      await vi.waitFor(() => {
        expect(ws.sentMessages.length).toBe(1);
      });

      const authMessage = JSON.parse(ws.sentMessages[0]!);
      expect(authMessage.type).toBe("auth");
      expect(authMessage.token).toBe("test-token-123");

      // Simulate auth success
      ws.simulateMessage({ type: "auth_result", success: true });

      await connectPromise;
      expect(transport.isConnected()).toBe(true);
    });

    it("should send auth message after connection with function token", async () => {
      const transport = WebSocketTransport.make({
        url: "ws://localhost:8080",
        authToken: () => "dynamic-token",
      });

      const connectPromise = transport.connect();
      const ws = MockWebSocket.getLatest()!;
      ws.simulateOpen();

      await vi.waitFor(() => {
        expect(ws.sentMessages.length).toBe(1);
      });

      const authMessage = JSON.parse(ws.sentMessages[0]!);
      expect(authMessage.token).toBe("dynamic-token");

      ws.simulateMessage({ type: "auth_result", success: true });
      await connectPromise;
    });

    it("should send auth message with async function token", async () => {
      const transport = WebSocketTransport.make({
        url: "ws://localhost:8080",
        authToken: async () => {
          return "async-token";
        },
      });

      const connectPromise = transport.connect();
      const ws = MockWebSocket.getLatest()!;
      ws.simulateOpen();

      await vi.waitFor(() => {
        expect(ws.sentMessages.length).toBe(1);
      });

      const authMessage = JSON.parse(ws.sentMessages[0]!);
      expect(authMessage.token).toBe("async-token");

      ws.simulateMessage({ type: "auth_result", success: true });
      await connectPromise;
    });

    it("should send empty token auth message when no authToken provided", async () => {
      const transport = WebSocketTransport.make({
        url: "ws://localhost:8080",
        // No authToken provided
      });

      const connectPromise = transport.connect();
      const ws = MockWebSocket.getLatest()!;
      ws.simulateOpen();

      // Should send auth message with empty token
      await vi.waitFor(() => {
        expect(ws.sentMessages.length).toBe(1);
      });

      const authMessage = JSON.parse(ws.sentMessages[0]!);
      expect(authMessage.type).toBe("auth");
      expect(authMessage.token).toBe("");

      // Simulate auth success
      ws.simulateMessage({ type: "auth_result", success: true });

      await connectPromise;
      expect(transport.isConnected()).toBe(true);
    });

    it("should reject connection on auth failure", async () => {
      let errorEmitted = false;

      const transport = WebSocketTransport.make({
        url: "ws://localhost:8080",
        authToken: "bad-token",
        onEvent: (event) => {
          if (event.type === "error") {
            errorEmitted = true;
          }
        },
      });

      const connectPromise = transport.connect();
      const ws = MockWebSocket.getLatest()!;
      ws.simulateOpen();

      await vi.waitFor(() => {
        expect(ws.sentMessages.length).toBe(1);
      });

      // Simulate auth failure
      ws.simulateMessage({
        type: "auth_result",
        success: false,
        error: "Invalid token",
      });

      await expect(connectPromise).rejects.toThrow("Invalid token");
      expect(errorEmitted).toBe(true);
      expect(transport.isConnected()).toBe(false);
    });
  });

  describe("presence", () => {
    describe("sendPresenceSet", () => {
      it("should send presence_set message when connected", async () => {
        const transport = WebSocketTransport.make({
          url: "ws://localhost:8080",
        });

        const connectPromise = transport.connect();
        const ws = MockWebSocket.getLatest()!;
        await ws.simulateOpenWithAuth();
        await connectPromise;

        transport.sendPresenceSet({ x: 100, y: 200, name: "Alice" });

        // 2 messages: auth + presence_set
        expect(ws.sentMessages.length).toBe(2);
        const authMsg = JSON.parse(ws.sentMessages[0]!);
        expect(authMsg.type).toBe("auth");
        const sent = JSON.parse(ws.sentMessages[1]!);
        expect(sent.type).toBe("presence_set");
        expect(sent.data).toEqual({ x: 100, y: 200, name: "Alice" });
      });

      it("should queue presence_set during reconnection", async () => {
        const transport = WebSocketTransport.make({
          url: "ws://localhost:8080",
          autoReconnect: true,
        });

        const connectPromise = transport.connect();
        const ws = MockWebSocket.getLatest()!;
        await ws.simulateOpenWithAuth();
        await connectPromise;

        // Simulate connection lost
        ws.simulateClose(1006, "Connection lost");

        // Queue presence message during reconnection
        transport.sendPresenceSet({ cursor: { x: 50, y: 75 } });

        // Reconnect
        vi.advanceTimersByTime(1000);
        const newWs = MockWebSocket.getLatest()!;
        await newWs.simulateOpenWithAuth();

        // Queued message should be sent after auth
        // 2 messages: auth + presence_set (queued message)
        expect(newWs.sentMessages.length).toBe(2);
        const authMsg = JSON.parse(newWs.sentMessages[0]!);
        expect(authMsg.type).toBe("auth");
        const sent = JSON.parse(newWs.sentMessages[1]!);
        expect(sent.type).toBe("presence_set");
        expect(sent.data).toEqual({ cursor: { x: 50, y: 75 } });
      });

      it("should not send when disconnected", async () => {
        const transport = WebSocketTransport.make({
          url: "ws://localhost:8080",
        });

        // Never connect - sendPresenceSet should be silently ignored
        transport.sendPresenceSet({ x: 100, y: 200 });

        // No WebSocket created, nothing sent
        expect(MockWebSocket.instances.length).toBe(0);
      });
    });

    describe("sendPresenceClear", () => {
      it("should send presence_clear message when connected", async () => {
        const transport = WebSocketTransport.make({
          url: "ws://localhost:8080",
        });

        const connectPromise = transport.connect();
        const ws = MockWebSocket.getLatest()!;
        await ws.simulateOpenWithAuth();
        await connectPromise;

        transport.sendPresenceClear();

        // 2 messages: auth + presence_clear
        expect(ws.sentMessages.length).toBe(2);
        const authMsg = JSON.parse(ws.sentMessages[0]!);
        expect(authMsg.type).toBe("auth");
        const sent = JSON.parse(ws.sentMessages[1]!);
        expect(sent.type).toBe("presence_clear");
      });

      it("should queue presence_clear during reconnection", async () => {
        const transport = WebSocketTransport.make({
          url: "ws://localhost:8080",
          autoReconnect: true,
        });

        const connectPromise = transport.connect();
        const ws = MockWebSocket.getLatest()!;
        await ws.simulateOpenWithAuth();
        await connectPromise;

        // Simulate connection lost
        ws.simulateClose(1006, "Connection lost");

        // Queue presence_clear during reconnection
        transport.sendPresenceClear();

        // Reconnect
        vi.advanceTimersByTime(1000);
        const newWs = MockWebSocket.getLatest()!;
        await newWs.simulateOpenWithAuth();

        // Queued message should be sent after auth
        expect(newWs.sentMessages.length).toBe(2);
        const sent = JSON.parse(newWs.sentMessages[1]!);
        expect(sent.type).toBe("presence_clear");
      });
    });

    describe("presence message forwarding", () => {
      it("should forward presence_snapshot to subscribers", async () => {
        const transport = WebSocketTransport.make({
          url: "ws://localhost:8080",
        });

        const messages: Transport.ServerMessage[] = [];
        transport.subscribe((msg) => messages.push(msg));

        const connectPromise = transport.connect();
        const ws = MockWebSocket.getLatest()!;
        await ws.simulateOpenWithAuth();
        await connectPromise;

        ws.simulateMessage({
          type: "presence_snapshot",
          selfId: "conn-123",
          presences: {
            "conn-456": { data: { x: 10, y: 20 }, userId: "user-456" },
          },
        });

        expect(messages.length).toBe(1);
        expect(messages[0]!.type).toBe("presence_snapshot");
        if (messages[0]!.type === "presence_snapshot") {
          expect(messages[0]!.selfId).toBe("conn-123");
          expect(messages[0]!.presences["conn-456"]).toEqual({
            data: { x: 10, y: 20 },
            userId: "user-456",
          });
        }
      });

      it("should forward presence_update to subscribers", async () => {
        const transport = WebSocketTransport.make({
          url: "ws://localhost:8080",
        });

        const messages: Transport.ServerMessage[] = [];
        transport.subscribe((msg) => messages.push(msg));

        const connectPromise = transport.connect();
        const ws = MockWebSocket.getLatest()!;
        await ws.simulateOpenWithAuth();
        await connectPromise;

        ws.simulateMessage({
          type: "presence_update",
          id: "conn-789",
          data: { cursor: { x: 50, y: 100 } },
          userId: "user-789",
        });

        expect(messages.length).toBe(1);
        expect(messages[0]!.type).toBe("presence_update");
        if (messages[0]!.type === "presence_update") {
          expect(messages[0]!.id).toBe("conn-789");
          expect(messages[0]!.data).toEqual({ cursor: { x: 50, y: 100 } });
          expect(messages[0]!.userId).toBe("user-789");
        }
      });

      it("should forward presence_remove to subscribers", async () => {
        const transport = WebSocketTransport.make({
          url: "ws://localhost:8080",
        });

        const messages: Transport.ServerMessage[] = [];
        transport.subscribe((msg) => messages.push(msg));

        const connectPromise = transport.connect();
        const ws = MockWebSocket.getLatest()!;
        await ws.simulateOpenWithAuth();
        await connectPromise;

        ws.simulateMessage({
          type: "presence_remove",
          id: "conn-disconnected",
        });

        expect(messages.length).toBe(1);
        expect(messages[0]!.type).toBe("presence_remove");
        if (messages[0]!.type === "presence_remove") {
          expect(messages[0]!.id).toBe("conn-disconnected");
        }
      });

      it("should forward presence_update without userId", async () => {
        const transport = WebSocketTransport.make({
          url: "ws://localhost:8080",
        });

        const messages: Transport.ServerMessage[] = [];
        transport.subscribe((msg) => messages.push(msg));

        const connectPromise = transport.connect();
        const ws = MockWebSocket.getLatest()!;
        await ws.simulateOpenWithAuth();
        await connectPromise;

        ws.simulateMessage({
          type: "presence_update",
          id: "conn-anon",
          data: { status: "online" },
        });

        expect(messages.length).toBe(1);
        if (messages[0]!.type === "presence_update") {
          expect(messages[0]!.id).toBe("conn-anon");
          expect(messages[0]!.data).toEqual({ status: "online" });
          expect(messages[0]!.userId).toBeUndefined();
        }
      });
    });
  });
});
