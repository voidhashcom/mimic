import { describe, it, expect, beforeEach } from "vitest";
import * as Schema from "effect/Schema";
import * as Primitive from "../../src/Primitive";
import * as Transaction from "../../src/Transaction";
import * as OperationPath from "../../src/OperationPath";
import * as ClientDocument from "../../src/client/ClientDocument";
import type * as Transport from "../../src/client/Transport";
import * as Rebase from "../../src/client/Rebase";
import * as StateMonitor from "../../src/client/StateMonitor";
import * as Presence from "../../src/Presence";
import * as Document from "../../src/Document";

// =============================================================================
// Mock Transport
// =============================================================================

interface MockTransport extends Transport.Transport {
  sentTransactions: Transaction.Transaction[];
  handlers: Set<(message: Transport.ServerMessage) => void>;
  simulateServerMessage: (message: Transport.ServerMessage) => void;
  snapshotRequested: boolean;
  autoSendSnapshot?: { state: unknown; version: number };
  // Presence tracking
  presenceSetCalls: unknown[];
  presenceClearCalls: number;
}

const createMockTransport = (options?: {
  autoSendSnapshot?: { state: unknown; version: number };
}): MockTransport => {
  const handlers = new Set<(message: Transport.ServerMessage) => void>();
  const sentTransactions: Transaction.Transaction[] = [];
  let _connected = false;
  let snapshotRequested = false;
  const presenceSetCalls: unknown[] = [];
  let presenceClearCalls = 0;

  const transport: MockTransport = {
    sentTransactions,
    handlers,
    snapshotRequested,
    autoSendSnapshot: options?.autoSendSnapshot,
    get presenceSetCalls() { return presenceSetCalls; },
    get presenceClearCalls() { return presenceClearCalls; },

    send: (transaction) => {
      sentTransactions.push(transaction);
    },

    requestSnapshot: () => {
      snapshotRequested = true;
      // If autoSendSnapshot is configured, send it immediately
      if (transport.autoSendSnapshot) {
        // Use setTimeout to simulate async behavior
        setTimeout(() => {
          transport.simulateServerMessage({
            type: "snapshot",
            state: transport.autoSendSnapshot!.state,
            version: transport.autoSendSnapshot!.version,
          });
        }, 0);
      }
    },

    subscribe: (handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },

    connect: async () => {
      _connected = true;
    },

    disconnect: () => {
      _connected = false;
    },

    isConnected: () => _connected,

    sendPresenceSet: (data: unknown) => {
      presenceSetCalls.push(data);
    },

    sendPresenceClear: () => {
      presenceClearCalls++;
    },

    simulateServerMessage: (message) => {
      for (const handler of handlers) {
        handler(message);
      }
    },
  };

  return transport;
};

// =============================================================================
// Test Schema
// =============================================================================

const TestSchema = Primitive.Struct({
  title: Primitive.String().default(""),
  count: Primitive.Number().default(0),
  items: Primitive.Array(
    Primitive.Struct({
      name: Primitive.String(),
      done: Primitive.Boolean().default(false),
    })
  ),
});

type TestState = Primitive.InferState<typeof TestSchema>;

// =============================================================================
// ClientDocument Tests
// =============================================================================

describe("ClientDocument", () => {
  let transport: ReturnType<typeof createMockTransport>;

  beforeEach(() => {
    transport = createMockTransport();
  });

  describe("make", () => {
    it("should create a client document with initial state", async () => {
      const initialState: TestState = {
        title: "Test",
        count: 5,
        items: [],
      };

      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState,
      });

      await client.connect();

      expect(client.get()).toEqual(initialState);
      expect(client.getServerState()).toEqual(initialState);
    });

    it("should create a client document without initial state and wait for snapshot", async () => {
      // Create transport that auto-sends snapshot
      const transportWithSnapshot = createMockTransport({
        autoSendSnapshot: { state: { title: "From Server", count: 42, items: [] }, version: 1 },
      });

      const client = ClientDocument.make({
        schema: TestSchema,
        transport: transportWithSnapshot,
      });

      expect(client.isReady()).toBe(false);

      await client.connect();

      // Should have state from server snapshot
      expect(client.isReady()).toBe(true);
      expect(client.get()?.title).toBe("From Server");
      expect(client.get()?.count).toBe(42);
    });
  });

  describe("transaction", () => {
    it("should apply changes optimistically", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
      });

      await client.connect();

      client.transaction((root) => {
        root.title.set("New Title");
      });

      expect(client.get()?.title).toBe("New Title");
      expect(client.hasPendingChanges()).toBe(true);
      expect(client.getPendingCount()).toBe(1);
    });

    it("should send transaction to server", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
      });

      await client.connect();

      client.transaction((root) => {
        root.count.set(42);
      });

      expect(transport.sentTransactions.length).toBe(1);
      expect(transport.sentTransactions[0]!.ops.length).toBe(1);
      expect(transport.sentTransactions[0]!.ops[0]!.kind).toBe("number.set");
    });

    it("should queue transactions when not connected", () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
      });

      // Transactions should work offline - they get queued in the transport
      client.transaction((root) => {
        root.title.set("Test");
      });

      // State should be optimistically updated
      expect(client.get()?.title).toBe("Test");
      // Transaction is pending
      expect(client.hasPendingChanges()).toBe(true);
      // Transaction was sent to transport (it will queue it)
      expect(transport.sentTransactions.length).toBe(1);
    });

    it("should queue multiple transactions when not connected", () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
      });

      // Create multiple transactions while offline
      client.transaction((root) => {
        root.title.set("First");
      });

      client.transaction((root) => {
        root.count.set(10);
      });

      client.transaction((root) => {
        root.title.set("Second");
      });

      // All state changes should be applied optimistically
      expect(client.get()?.title).toBe("Second");
      expect(client.get()?.count).toBe(10);
      // All transactions are pending
      expect(client.getPendingCount()).toBe(3);
      // All transactions were sent to transport
      expect(transport.sentTransactions.length).toBe(3);
    });

    it("should throw when not ready (no initial state)", () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        // No initial state - client is not ready until snapshot received
      });

      expect(() => {
        client.transaction((root) => {
          root.title.set("Test");
        });
      }).toThrow("Client is not ready");
    });
  });

  describe("offline transaction handling", () => {
    it("should confirm queued transactions after reconnection", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
      });

      // Create transaction while offline
      client.transaction((root) => {
        root.title.set("Offline Change");
      });

      expect(client.hasPendingChanges()).toBe(true);
      const pendingTx = transport.sentTransactions[0]!;

      // Connect and simulate server confirming the transaction
      await client.connect();

      // Server broadcasts our transaction (confirming it)
      transport.simulateServerMessage({
        type: "transaction",
        transaction: pendingTx,
        version: 1,
      });

      // Transaction should be confirmed
      expect(client.hasPendingChanges()).toBe(false);
      expect(client.get()?.title).toBe("Offline Change");
      expect(client.getServerState()?.title).toBe("Offline Change");
    });

    it("should handle multiple queued transactions being confirmed in order", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
      });

      // Create multiple transactions while offline
      client.transaction((root) => {
        root.title.set("First");
      });

      client.transaction((root) => {
        root.count.set(42);
      });

      expect(client.getPendingCount()).toBe(2);
      const tx1 = transport.sentTransactions[0]!;
      const tx2 = transport.sentTransactions[1]!;

      // Connect
      await client.connect();

      // Server confirms first transaction
      transport.simulateServerMessage({
        type: "transaction",
        transaction: tx1,
        version: 1,
      });

      expect(client.getPendingCount()).toBe(1);
      expect(client.getServerState()?.title).toBe("First");

      // Server confirms second transaction
      transport.simulateServerMessage({
        type: "transaction",
        transaction: tx2,
        version: 2,
      });

      expect(client.getPendingCount()).toBe(0);
      expect(client.getServerState()?.count).toBe(42);
    });

    it("should handle rejection of queued transactions", async () => {
      let rejectedTx: Transaction.Transaction | null = null;
      let rejectionReason: string | null = null;

      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "Original", count: 0, items: [] },
        onRejection: (tx, reason) => {
          rejectedTx = tx;
          rejectionReason = reason;
        },
      });

      // Create transaction while offline
      client.transaction((root) => {
        root.title.set("Offline Change");
      });

      const pendingTx = transport.sentTransactions[0]!;

      // Connect
      await client.connect();

      // Server rejects the transaction
      transport.simulateServerMessage({
        type: "error",
        transactionId: pendingTx.id,
        reason: "Conflict with another user",
      });

      // Transaction should be removed from pending
      expect(client.hasPendingChanges()).toBe(false);
      // Optimistic state should revert to server state
      expect(client.get()?.title).toBe("Original");
      // Rejection callback should be called
      expect(rejectedTx).not.toBeNull();
      expect(rejectionReason).toBe("Conflict with another user");
    });

    it("should rebase queued transactions against concurrent server changes", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
      });

      // Create transaction while offline
      client.transaction((root) => {
        root.title.set("My Title");
      });

      await client.connect();

      // Another user's change comes in first
      const otherUserTx = Transaction.make([
        {
          kind: "number.set" as const,
          path: OperationPath.make("count"),
          payload: 100,
        },
      ]);

      transport.simulateServerMessage({
        type: "transaction",
        transaction: otherUserTx,
        version: 1,
      });

      // Our transaction should still be pending
      expect(client.hasPendingChanges()).toBe(true);
      // Server state should reflect other user's change
      expect(client.getServerState()?.count).toBe(100);
      // Optimistic state should have both changes
      expect(client.get()?.count).toBe(100);
      expect(client.get()?.title).toBe("My Title");
    });

    it("should work with disconnect and reconnect cycle", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
      });

      // Connect first
      await client.connect();

      client.transaction((root) => {
        root.title.set("Online Change");
      });

      // Disconnect
      client.disconnect();

      // Create transaction while disconnected
      client.transaction((root) => {
        root.count.set(50);
      });

      // State should still be optimistically updated
      expect(client.get()?.title).toBe("Online Change");
      expect(client.get()?.count).toBe(50);
      expect(client.getPendingCount()).toBe(2);

      // Reconnect
      await client.connect();

      // Server confirms both transactions
      transport.simulateServerMessage({
        type: "transaction",
        transaction: transport.sentTransactions[0]!,
        version: 1,
      });

      transport.simulateServerMessage({
        type: "transaction",
        transaction: transport.sentTransactions[1]!,
        version: 2,
      });

      expect(client.hasPendingChanges()).toBe(false);
      expect(client.getServerState()?.title).toBe("Online Change");
      expect(client.getServerState()?.count).toBe(50);
    });

    it("should preserve pending transactions during brief disconnection", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
      });

      await client.connect();

      // Create a transaction
      client.transaction((root) => {
        root.title.set("Before Disconnect");
      });

      const pendingCount = client.getPendingCount();
      expect(pendingCount).toBe(1);

      // Simulate brief disconnection
      client.disconnect();

      // Pending transactions should still be there
      expect(client.getPendingCount()).toBe(pendingCount);
      expect(client.get()?.title).toBe("Before Disconnect");
    });

    it("should handle multiple field changes while offline", () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
      });

      // Create multiple transactions affecting different fields while offline
      client.transaction((root) => {
        root.title.set("First Title");
      });

      client.transaction((root) => {
        root.count.set(10);
      });

      client.transaction((root) => {
        root.title.set("Final Title");
        root.count.set(20);
      });

      // All changes should be applied optimistically
      expect(client.get()?.title).toBe("Final Title");
      expect(client.get()?.count).toBe(20);

      // All transactions queued
      expect(transport.sentTransactions.length).toBe(3);
      expect(client.getPendingCount()).toBe(3);
    });
  });

  describe("server transaction handling", () => {
    it("should confirm our pending transaction when server broadcasts it", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
      });

      await client.connect();

      client.transaction((root) => {
        root.title.set("My Change");
      });

      const sentTx = transport.sentTransactions[0]!;
      expect(client.hasPendingChanges()).toBe(true);

      // Server broadcasts our transaction
      transport.simulateServerMessage({
        type: "transaction",
        transaction: sentTx,
        version: 1,
      });

      expect(client.hasPendingChanges()).toBe(false);
      expect(client.get()?.title).toBe("My Change");
      expect(client.getServerState()?.title).toBe("My Change");
    });

    it("should rebase pending changes when server transaction arrives", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "Original", count: 0, items: [] },
      });

      await client.connect();

      // Make a local change to title
      client.transaction((root) => {
        root.title.set("Client Title");
      });

      expect(client.get()?.title).toBe("Client Title");

      // Server sends a different transaction (e.g., count change)
      const serverTx = Transaction.make([
        {
          kind: "number.set",
          path: { _tag: "OperationPath" as const, toTokens: () => ["count"], concat: () => ({} as any), append: () => ({} as any), pop: () => ({} as any), shift: () => ({} as any) },
          payload: 100,
        },
      ]);

      transport.simulateServerMessage({
        type: "transaction",
        transaction: serverTx,
        version: 1,
      });

      // Our pending change should still be there
      expect(client.hasPendingChanges()).toBe(true);
      expect(client.get()?.title).toBe("Client Title");
      expect(client.getServerState()?.count).toBe(100);
    });
  });

  describe("rejection handling", () => {
    it("should handle transaction rejection and notify callback", async () => {
      let rejectedTx: Transaction.Transaction | null = null;
      let rejectionReason: string | null = null;

      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "Original", count: 0, items: [] },
        onRejection: (tx, reason) => {
          rejectedTx = tx;
          rejectionReason = reason;
        },
      });

      await client.connect();

      client.transaction((root) => {
        root.title.set("Rejected Change");
      });

      const sentTx = transport.sentTransactions[0]!;

      // Server rejects the transaction
      transport.simulateServerMessage({
        type: "error",
        transactionId: sentTx.id,
        reason: "Invalid operation",
      });

      expect(client.hasPendingChanges()).toBe(false);
      expect(client.get()?.title).toBe("Original"); // Rolled back
      expect((rejectedTx as unknown as Transaction.Transaction | null)?.id).toBe(sentTx.id);
      expect(rejectionReason).toBe("Invalid operation");
    });
  });

  describe("snapshot handling", () => {
    it("should reset state when receiving snapshot", async () => {
      let rejectionCount = 0;

      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "Old", count: 0, items: [] },
        onRejection: () => {
          rejectionCount++;
        },
      });

      await client.connect();

      // Make some pending changes
      client.transaction((root) => {
        root.title.set("Pending 1");
      });
      client.transaction((root) => {
        root.count.set(50);
      });

      expect(client.getPendingCount()).toBe(2);

      // Server sends snapshot
      transport.simulateServerMessage({
        type: "snapshot",
        state: { title: "Server Title", count: 100, items: [] },
        version: 10,
      });

      expect(client.hasPendingChanges()).toBe(false);
      expect(client.get()?.title).toBe("Server Title");
      expect(client.get()?.count).toBe(100);
      expect(client.getServerVersion()).toBe(10);
      expect(rejectionCount).toBe(2); // Both pending were rejected
    });
  });

  describe("connection management", () => {
    it("should track connection status", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
      });

      expect(client.isConnected()).toBe(false);

      await client.connect();
      expect(client.isConnected()).toBe(true);

      client.disconnect();
      expect(client.isConnected()).toBe(false);
    });
  });

  describe("initialization", () => {
    it("should be ready immediately with initial state", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "Initial", count: 0, items: [] },
      });

      expect(client.isReady()).toBe(true);
      await client.connect();
      expect(client.isReady()).toBe(true);
    });

    it("should buffer transactions during initialization", async () => {
      let readyCalled = false;

      // Create a transport that doesn't auto-send snapshot
      const manualTransport = createMockTransport();

      const client = ClientDocument.make({
        schema: TestSchema,
        transport: manualTransport,
        onReady: () => {
          readyCalled = true;
        },
      });

      // Start connecting (this will enter initializing state and request snapshot)
      const connectPromise = client.connect();

      // Wait a tick for the connection to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Simulate transactions arriving before snapshot
      manualTransport.simulateServerMessage({
        type: "transaction",
        transaction: Transaction.make([
          {
            kind: "string.set" as const,
            path: OperationPath.make("title"),
            payload: "From TX v2",
          },
        ]),
        version: 2,
      });

      manualTransport.simulateServerMessage({
        type: "transaction",
        transaction: Transaction.make([
          {
            kind: "number.set" as const,
            path: OperationPath.make("count"),
            payload: 100,
          },
        ]),
        version: 3,
      });

      // Now send snapshot at version 1 (older than buffered transactions)
      manualTransport.simulateServerMessage({
        type: "snapshot",
        state: { title: "Snapshot Title", count: 0, items: [] },
        version: 1,
      });

      // Wait for connect to complete
      await connectPromise;

      // Should be ready now
      expect(client.isReady()).toBe(true);
      expect(readyCalled).toBe(true);

      // State should include buffered transactions applied on top of snapshot
      expect(client.get()?.title).toBe("From TX v2");
      expect(client.get()?.count).toBe(100);
      expect(client.getServerVersion()).toBe(3);
    });

    it("should ignore buffered transactions older than snapshot", async () => {
      const manualTransport = createMockTransport();

      const client = ClientDocument.make({
        schema: TestSchema,
        transport: manualTransport,
      });

      const connectPromise = client.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Simulate old transaction arriving before snapshot
      manualTransport.simulateServerMessage({
        type: "transaction",
        transaction: Transaction.make([
          {
            kind: "string.set" as const,
            path: OperationPath.make("title"),
            payload: "Old Title",
          },
        ]),
        version: 1,
      });

      // Send snapshot at version 5 (newer than buffered transaction)
      manualTransport.simulateServerMessage({
        type: "snapshot",
        state: { title: "Snapshot Title", count: 50, items: [] },
        version: 5,
      });

      await connectPromise;

      // State should be from snapshot, old transaction should be ignored
      expect(client.get()?.title).toBe("Snapshot Title");
      expect(client.get()?.count).toBe(50);
      expect(client.getServerVersion()).toBe(5);
    });

    it("should throw when creating transaction before ready", async () => {
      const manualTransport = createMockTransport();

      const client = ClientDocument.make({
        schema: TestSchema,
        transport: manualTransport,
      });

      // Start connecting but don't complete
      const connectPromise = client.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Try to create transaction - should fail
      expect(() => {
        client.transaction((root) => {
          root.title.set("Test");
        });
      }).toThrow("Client is not ready");

      // Complete initialization
      manualTransport.simulateServerMessage({
        type: "snapshot",
        state: { title: "", count: 0, items: [] },
        version: 1,
      });

      await connectPromise;

      // Now transaction should work
      expect(() => {
        client.transaction((root) => {
          root.title.set("Test");
        });
      }).not.toThrow();
    });

    it("should timeout initialization if snapshot never arrives", async () => {
      const manualTransport = createMockTransport();

      const client = ClientDocument.make({
        schema: TestSchema,
        transport: manualTransport,
        initTimeout: 50, // Very short timeout for testing
      });

      // Start connecting - should timeout
      await expect(client.connect()).rejects.toThrow("Initialization timed out");

      // Should not be ready
      expect(client.isReady()).toBe(false);
    });

    it("should handle disconnect during initialization", async () => {
      const manualTransport = createMockTransport();

      const client = ClientDocument.make({
        schema: TestSchema,
        transport: manualTransport,
      });

      const connectPromise = client.connect();
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Disconnect while waiting for snapshot
      client.disconnect();

      // Connect should reject
      await expect(connectPromise).rejects.toThrow("Disconnected during initialization");

      expect(client.isReady()).toBe(false);
    });
  });
});

// =============================================================================
// Rebase Tests
// =============================================================================

describe("Rebase", () => {
  describe("transformOperation", () => {
    it("should not transform operations on different paths", () => {
      const clientOp = {
        kind: "string.set" as const,
        path: OperationPath.make("title"),
        payload: "client",
      };

      const serverOp = {
        kind: "number.set" as const,
        path: OperationPath.make("count"),
        payload: 100,
      };

      const result = Rebase.transformOperation(clientOp, serverOp);

      expect(result.type).toBe("transformed");
      if (result.type === "transformed") {
        expect(result.operation).toBe(clientOp);
      }
    });

    it("should handle same-path operations (client wins)", () => {
      const clientOp = {
        kind: "string.set" as const,
        path: OperationPath.make("title"),
        payload: "client",
      };

      const serverOp = {
        kind: "string.set" as const,
        path: OperationPath.make("title"),
        payload: "server",
      };

      const result = Rebase.transformOperation(clientOp, serverOp);

      expect(result.type).toBe("transformed");
      if (result.type === "transformed") {
        expect(result.operation.payload).toBe("client");
      }
    });

    it("should make client op noop when server removes target element", () => {
      const clientOp = {
        kind: "string.set" as const,
        path: OperationPath.make("items/item-1/name"),
        payload: "new name",
      };

      const serverOp = {
        kind: "array.remove" as const,
        path: OperationPath.make("items"),
        payload: { id: "item-1" },
      };

      const result = Rebase.transformOperation(clientOp, serverOp);

      expect(result.type).toBe("noop");
    });
  });

  describe("rebasePendingTransactions", () => {
    it("should transform all pending transactions against server transaction", () => {
      const pending1 = Transaction.make([
        {
          kind: "string.set" as const,
          path: OperationPath.make("title"),
          payload: "pending1",
        },
      ]);

      const pending2 = Transaction.make([
        {
          kind: "number.set" as const,
          path: OperationPath.make("count"),
          payload: 10,
        },
      ]);

      const serverTx = Transaction.make([
        {
          kind: "string.set" as const,
          path: OperationPath.make("description"),
          payload: "server desc",
        },
      ]);

      const rebased = Rebase.rebasePendingTransactions([pending1, pending2], serverTx);

      expect(rebased.length).toBe(2);
      expect(rebased[0]!.id).toBe(pending1.id);
      expect(rebased[1]!.id).toBe(pending2.id);
    });
  });
});

// =============================================================================
// StateMonitor Tests
// =============================================================================

describe("StateMonitor", () => {
  describe("version tracking", () => {
    it("should accept sequential versions", () => {
      const monitor = StateMonitor.make();

      expect(monitor.onServerVersion(1)).toBe(true);
      expect(monitor.onServerVersion(2)).toBe(true);
      expect(monitor.onServerVersion(3)).toBe(true);
    });

    it("should detect large version gaps", () => {
      let driftDetected = false;

      const monitor = StateMonitor.make({
        maxVersionGap: 5,
        onEvent: (event) => {
          if (event.type === "drift_detected") {
            driftDetected = true;
          }
        },
      });

      monitor.onServerVersion(1);
      const result = monitor.onServerVersion(20); // Gap of 19

      expect(result).toBe(false);
      expect(driftDetected).toBe(true);
    });
  });

  describe("pending tracking", () => {
    it("should track and untrack pending transactions", () => {
      const monitor = StateMonitor.make();

      monitor.trackPending({ id: "tx-1", sentAt: Date.now() });
      monitor.trackPending({ id: "tx-2", sentAt: Date.now() });

      expect(monitor.getStatus().pendingCount).toBe(2);

      monitor.untrackPending("tx-1");

      expect(monitor.getStatus().pendingCount).toBe(1);
    });

    it("should identify stale pending transactions", () => {
      const monitor = StateMonitor.make({
        stalePendingThreshold: 100, // 100ms for testing
      });

      const oldTime = Date.now() - 200; // 200ms ago
      monitor.trackPending({ id: "tx-old", sentAt: oldTime });
      monitor.trackPending({ id: "tx-new", sentAt: Date.now() });

      const stale = monitor.getStalePending();

      expect(stale.length).toBe(1);
      expect(stale[0]!.id).toBe("tx-old");
    });
  });

  describe("reset", () => {
    it("should clear state on reset", () => {
      let recoveryCompleted = false;

      const monitor = StateMonitor.make({
        onEvent: (event) => {
          if (event.type === "recovery_completed") {
            recoveryCompleted = true;
          }
        },
      });

      monitor.trackPending({ id: "tx-1", sentAt: Date.now() });
      monitor.onServerVersion(5);

      monitor.reset(10);

      expect(monitor.getStatus().pendingCount).toBe(0);
      expect(monitor.getStatus().expectedVersion).toBe(10);
      expect(recoveryCompleted).toBe(true);
    });
  });
});

// =============================================================================
// ClientDocument Presence Tests
// =============================================================================

const CursorPresenceSchema = Presence.make({
  schema: Schema.Struct({
    x: Schema.Number,
    y: Schema.Number,
    name: Schema.optional(Schema.String),
  }),
});

describe("ClientDocument Presence", () => {
  let transport: ReturnType<typeof createMockTransport>;

  beforeEach(() => {
    transport = createMockTransport();
  });

  describe("presence API availability", () => {
    it("should have undefined presence when no presence schema provided", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
      });

      await client.connect();

      expect(client.presence).toBeUndefined();
    });

    it("should have defined presence when presence schema provided", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
        presence: CursorPresenceSchema,
      });

      await client.connect();

      expect(client.presence).toBeDefined();
      expect(typeof client.presence!.selfId).toBe("function");
      expect(typeof client.presence!.self).toBe("function");
      expect(typeof client.presence!.others).toBe("function");
      expect(typeof client.presence!.all).toBe("function");
      expect(typeof client.presence!.set).toBe("function");
      expect(typeof client.presence!.clear).toBe("function");
      expect(typeof client.presence!.subscribe).toBe("function");
    });
  });

  describe("selfId", () => {
    it("should return undefined before presence_snapshot received", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
        presence: CursorPresenceSchema,
      });

      await client.connect();

      expect(client.presence!.selfId()).toBeUndefined();
    });

    it("should return correct id after presence_snapshot received", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
        presence: CursorPresenceSchema,
      });

      await client.connect();

      transport.simulateServerMessage({
        type: "presence_snapshot",
        selfId: "conn-my-id",
        presences: {},
      });

      expect(client.presence!.selfId()).toBe("conn-my-id");
    });
  });

  describe("self", () => {
    it("should return undefined before set is called", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
        presence: CursorPresenceSchema,
      });

      await client.connect();

      expect(client.presence!.self()).toBeUndefined();
    });

    it("should return data after set is called", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
        presence: CursorPresenceSchema,
      });

      await client.connect();

      client.presence!.set({ x: 100, y: 200 });

      expect(client.presence!.self()).toEqual({ x: 100, y: 200 });
    });
  });

  describe("others", () => {
    it("should return empty map initially", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
        presence: CursorPresenceSchema,
      });

      await client.connect();

      expect(client.presence!.others().size).toBe(0);
    });

    it("should return other presences from snapshot", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
        presence: CursorPresenceSchema,
      });

      await client.connect();

      transport.simulateServerMessage({
        type: "presence_snapshot",
        selfId: "conn-me",
        presences: {
          "conn-other-1": { data: { x: 10, y: 20 }, userId: "user-1" },
          "conn-other-2": { data: { x: 30, y: 40 } },
        },
      });

      const others = client.presence!.others();
      expect(others.size).toBe(2);
      expect(others.get("conn-other-1")).toEqual({ data: { x: 10, y: 20 }, userId: "user-1" });
      expect(others.get("conn-other-2")).toEqual({ data: { x: 30, y: 40 } });
    });

    it("should update on presence_update", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
        presence: CursorPresenceSchema,
      });

      await client.connect();

      transport.simulateServerMessage({
        type: "presence_snapshot",
        selfId: "conn-me",
        presences: {},
      });

      transport.simulateServerMessage({
        type: "presence_update",
        id: "conn-new-user",
        data: { x: 50, y: 60 },
        userId: "user-new",
      });

      const others = client.presence!.others();
      expect(others.size).toBe(1);
      expect(others.get("conn-new-user")).toEqual({ data: { x: 50, y: 60 }, userId: "user-new" });
    });

    it("should remove on presence_remove", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
        presence: CursorPresenceSchema,
      });

      await client.connect();

      transport.simulateServerMessage({
        type: "presence_snapshot",
        selfId: "conn-me",
        presences: {
          "conn-leaving": { data: { x: 10, y: 20 } },
        },
      });

      expect(client.presence!.others().size).toBe(1);

      transport.simulateServerMessage({
        type: "presence_remove",
        id: "conn-leaving",
      });

      expect(client.presence!.others().size).toBe(0);
    });
  });

  describe("all", () => {
    it("should combine self and others", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
        presence: CursorPresenceSchema,
      });

      await client.connect();

      transport.simulateServerMessage({
        type: "presence_snapshot",
        selfId: "conn-me",
        presences: {
          "conn-other": { data: { x: 10, y: 20 } },
        },
      });

      client.presence!.set({ x: 100, y: 200 });

      const all = client.presence!.all();
      expect(all.size).toBe(2);
      expect(all.get("conn-me")).toEqual({ data: { x: 100, y: 200 } });
      expect(all.get("conn-other")).toEqual({ data: { x: 10, y: 20 } });
    });

    it("should not include self if self data not set", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
        presence: CursorPresenceSchema,
      });

      await client.connect();

      transport.simulateServerMessage({
        type: "presence_snapshot",
        selfId: "conn-me",
        presences: {
          "conn-other": { data: { x: 10, y: 20 } },
        },
      });

      const all = client.presence!.all();
      expect(all.size).toBe(1);
      expect(all.has("conn-me")).toBe(false);
      expect(all.get("conn-other")).toEqual({ data: { x: 10, y: 20 } });
    });
  });

  describe("initialPresence", () => {
    it("should set presence to initialPresence value on connect", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
        presence: CursorPresenceSchema,
        initialPresence: { x: 50, y: 100, name: "Initial User" },
      });

      await client.connect();

      expect(client.presence!.self()).toEqual({ x: 50, y: 100, name: "Initial User" });
    });

    it("should send initialPresence to transport on connect", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
        presence: CursorPresenceSchema,
        initialPresence: { x: 25, y: 75 },
      });

      await client.connect();

      expect(transport.presenceSetCalls.length).toBe(1);
      expect(transport.presenceSetCalls[0]).toEqual({ x: 25, y: 75 });
    });

    it("should notify subscribers when initialPresence is set", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
        presence: CursorPresenceSchema,
        initialPresence: { x: 10, y: 20 },
      });

      let changeCount = 0;
      client.presence!.subscribe({
        onPresenceChange: () => {
          changeCount++;
        },
      });

      await client.connect();

      expect(changeCount).toBe(1);
    });

    it("should not set presence when initialPresence is not provided", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
        presence: CursorPresenceSchema,
      });

      await client.connect();

      expect(client.presence!.self()).toBeUndefined();
      expect(transport.presenceSetCalls.length).toBe(0);
    });
  });

  describe("set", () => {
    it("should validate data against schema", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
        presence: CursorPresenceSchema,
      });

      await client.connect();

      // Valid data should not throw
      expect(() => {
        client.presence!.set({ x: 100, y: 200 });
      }).not.toThrow();

      // Invalid data should throw
      expect(() => {
        client.presence!.set({ x: "invalid", y: 200 } as any);
      }).toThrow();
    });

    it("should send presence data to transport", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
        presence: CursorPresenceSchema,
      });

      await client.connect();

      client.presence!.set({ x: 100, y: 200, name: "Alice" });

      expect(transport.presenceSetCalls.length).toBe(1);
      expect(transport.presenceSetCalls[0]).toEqual({ x: 100, y: 200, name: "Alice" });
    });

    it("should update local self state", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
        presence: CursorPresenceSchema,
      });

      await client.connect();

      expect(client.presence!.self()).toBeUndefined();

      client.presence!.set({ x: 50, y: 75 });

      expect(client.presence!.self()).toEqual({ x: 50, y: 75 });
    });
  });

  describe("clear", () => {
    it("should send presence_clear to transport", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
        presence: CursorPresenceSchema,
      });

      await client.connect();

      client.presence!.clear();

      expect(transport.presenceClearCalls).toBe(1);
    });

    it("should clear local self state", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
        presence: CursorPresenceSchema,
      });

      await client.connect();

      client.presence!.set({ x: 100, y: 200 });
      expect(client.presence!.self()).toEqual({ x: 100, y: 200 });

      client.presence!.clear();
      expect(client.presence!.self()).toBeUndefined();
    });
  });

  describe("subscribe", () => {
    it("should notify on presence_snapshot", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
        presence: CursorPresenceSchema,
      });

      await client.connect();

      let changeCount = 0;
      client.presence!.subscribe({
        onPresenceChange: () => {
          changeCount++;
        },
      });

      transport.simulateServerMessage({
        type: "presence_snapshot",
        selfId: "conn-me",
        presences: {},
      });

      expect(changeCount).toBe(1);
    });

    it("should notify on presence_update", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
        presence: CursorPresenceSchema,
      });

      await client.connect();

      let changeCount = 0;
      client.presence!.subscribe({
        onPresenceChange: () => {
          changeCount++;
        },
      });

      transport.simulateServerMessage({
        type: "presence_update",
        id: "conn-other",
        data: { x: 10, y: 20 },
      });

      expect(changeCount).toBe(1);
    });

    it("should notify on presence_remove", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
        presence: CursorPresenceSchema,
      });

      await client.connect();

      let changeCount = 0;
      client.presence!.subscribe({
        onPresenceChange: () => {
          changeCount++;
        },
      });

      transport.simulateServerMessage({
        type: "presence_remove",
        id: "conn-other",
      });

      expect(changeCount).toBe(1);
    });

    it("should notify on local set", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
        presence: CursorPresenceSchema,
      });

      await client.connect();

      let changeCount = 0;
      client.presence!.subscribe({
        onPresenceChange: () => {
          changeCount++;
        },
      });

      client.presence!.set({ x: 100, y: 200 });

      expect(changeCount).toBe(1);
    });

    it("should notify on local clear", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
        presence: CursorPresenceSchema,
      });

      await client.connect();

      let changeCount = 0;
      client.presence!.subscribe({
        onPresenceChange: () => {
          changeCount++;
        },
      });

      client.presence!.clear();

      expect(changeCount).toBe(1);
    });

    it("should allow unsubscribing", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
        presence: CursorPresenceSchema,
      });

      await client.connect();

      let changeCount = 0;
      const unsubscribe = client.presence!.subscribe({
        onPresenceChange: () => {
          changeCount++;
        },
      });

      client.presence!.set({ x: 100, y: 200 });
      expect(changeCount).toBe(1);

      unsubscribe();

      client.presence!.set({ x: 200, y: 300 });
      expect(changeCount).toBe(1); // Should not increment
    });
  });

  describe("disconnect behavior", () => {
    it("should clear presence state on disconnect", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
        presence: CursorPresenceSchema,
      });

      await client.connect();

      transport.simulateServerMessage({
        type: "presence_snapshot",
        selfId: "conn-me",
        presences: {
          "conn-other": { data: { x: 10, y: 20 } },
        },
      });

      client.presence!.set({ x: 100, y: 200 });

      expect(client.presence!.selfId()).toBe("conn-me");
      expect(client.presence!.self()).toEqual({ x: 100, y: 200 });
      expect(client.presence!.others().size).toBe(1);

      client.disconnect();

      expect(client.presence!.selfId()).toBeUndefined();
      expect(client.presence!.self()).toBeUndefined();
      expect(client.presence!.others().size).toBe(0);
    });

    it("should notify subscribers on disconnect", async () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
        presence: CursorPresenceSchema,
      });

      await client.connect();

      transport.simulateServerMessage({
        type: "presence_snapshot",
        selfId: "conn-me",
        presences: {
          "conn-other": { data: { x: 10, y: 20 } },
        },
      });

      let changeCount = 0;
      client.presence!.subscribe({
        onPresenceChange: () => {
          changeCount++;
        },
      });

      // Reset count after snapshot notification
      changeCount = 0;

      client.disconnect();

      // Should notify when clearing presence
      expect(changeCount).toBe(1);
    });
  });

  // ===========================================================================
  // Draft Tests
  // ===========================================================================

  describe("drafts", () => {
    it("should create a draft and preview changes without sending to server", async () => {
      const initialState: TestState = { title: "Hello", count: 0, items: [] };
      const client = ClientDocument.make({ schema: TestSchema, transport, initialState });
      await client.connect();

      const draft = client.createDraft();
      draft.update((root) => root.title.set("Draft Title"));

      // Optimistic state should include draft
      expect(client.get()?.title).toBe("Draft Title");
      // No transaction sent to server
      expect(transport.sentTransactions.length).toBe(0);
    });

    it("should replace per-field ops on same path", async () => {
      const initialState: TestState = { title: "Hello", count: 0, items: [] };
      const client = ClientDocument.make({ schema: TestSchema, transport, initialState });
      await client.connect();

      const draft = client.createDraft();
      draft.update((root) => root.title.set("First"));
      draft.update((root) => root.title.set("Second"));

      expect(client.get()?.title).toBe("Second");
      expect(transport.sentTransactions.length).toBe(0);
    });

    it("should accumulate ops across different fields", async () => {
      const initialState: TestState = { title: "Hello", count: 0, items: [] };
      const client = ClientDocument.make({ schema: TestSchema, transport, initialState });
      await client.connect();

      const draft = client.createDraft();
      draft.update((root) => root.title.set("New Title"));
      draft.update((root) => root.count.set(42));

      expect(client.get()?.title).toBe("New Title");
      expect(client.get()?.count).toBe(42);
    });

    it("should commit draft as a single transaction", async () => {
      const initialState: TestState = { title: "Hello", count: 0, items: [] };
      const client = ClientDocument.make({ schema: TestSchema, transport, initialState });
      await client.connect();

      const draft = client.createDraft();
      draft.update((root) => root.title.set("Committed"));
      draft.update((root) => root.count.set(10));
      draft.commit();

      // Should have sent exactly one transaction
      expect(transport.sentTransactions.length).toBe(1);
      // State should still reflect the changes
      expect(client.get()?.title).toBe("Committed");
      expect(client.get()?.count).toBe(10);
      // Draft should be consumed
      expect(client.getActiveDraftIds().size).toBe(0);
    });

    it("should discard draft and revert to non-draft state", async () => {
      const initialState: TestState = { title: "Hello", count: 0, items: [] };
      const client = ClientDocument.make({ schema: TestSchema, transport, initialState });
      await client.connect();

      const draft = client.createDraft();
      draft.update((root) => root.title.set("Draft"));

      expect(client.get()?.title).toBe("Draft");

      draft.discard();

      expect(client.get()?.title).toBe("Hello");
      expect(transport.sentTransactions.length).toBe(0);
      expect(client.getActiveDraftIds().size).toBe(0);
    });

    it("should throw when using a consumed draft", async () => {
      const initialState: TestState = { title: "Hello", count: 0, items: [] };
      const client = ClientDocument.make({ schema: TestSchema, transport, initialState });
      await client.connect();

      const draft = client.createDraft();
      draft.commit();

      expect(() => draft.update((root) => root.title.set("x"))).toThrow();
      expect(() => draft.commit()).toThrow();
      expect(() => draft.discard()).toThrow();
    });

    it("should support multiple concurrent drafts", async () => {
      const initialState: TestState = { title: "Hello", count: 0, items: [] };
      const client = ClientDocument.make({ schema: TestSchema, transport, initialState });
      await client.connect();

      const draft1 = client.createDraft();
      const draft2 = client.createDraft();

      draft1.update((root) => root.title.set("Draft1"));
      draft2.update((root) => root.count.set(99));

      expect(client.get()?.title).toBe("Draft1");
      expect(client.get()?.count).toBe(99);
      expect(client.getActiveDraftIds().size).toBe(2);

      draft1.discard();
      expect(client.get()?.title).toBe("Hello");
      expect(client.get()?.count).toBe(99);

      draft2.commit();
      expect(client.get()?.count).toBe(99);
      expect(transport.sentTransactions.length).toBe(1);
    });

    it("should rebase draft ops when server transaction arrives", async () => {
      const initialState: TestState = { title: "Hello", count: 0, items: [] };
      const client = ClientDocument.make({ schema: TestSchema, transport, initialState });
      await client.connect();

      const draft = client.createDraft();
      draft.update((root) => root.title.set("My Draft"));

      // Create a proper server transaction by using a scratch document
      const scratchDoc = Document.make(TestSchema, { initialState });
      scratchDoc.transaction((root) => root.count.set(50));
      const serverTx = scratchDoc.flush();
      // Override the ID for clarity
      const serverTxWithId = { ...serverTx, id: "server-tx-1" };

      transport.simulateServerMessage({
        type: "transaction",
        transaction: serverTxWithId,
        version: 1,
      });

      // Draft title should survive, server count should be applied
      expect(client.get()?.title).toBe("My Draft");
      expect(client.get()?.count).toBe(50);
    });

    it("should notify onDraftChange listeners", async () => {
      const initialState: TestState = { title: "Hello", count: 0, items: [] };
      const client = ClientDocument.make({ schema: TestSchema, transport, initialState });
      await client.connect();

      let draftChangeCount = 0;
      client.subscribe({
        onDraftChange: () => { draftChangeCount++; },
      });

      const draft = client.createDraft();
      expect(draftChangeCount).toBe(1); // createDraft

      draft.update((root) => root.title.set("x"));
      expect(draftChangeCount).toBe(2); // update

      draft.discard();
      expect(draftChangeCount).toBe(3); // discard
    });

    it("should commit empty draft without sending transaction", async () => {
      const initialState: TestState = { title: "Hello", count: 0, items: [] };
      const client = ClientDocument.make({ schema: TestSchema, transport, initialState });
      await client.connect();

      const draft = client.createDraft();
      draft.commit();

      expect(transport.sentTransactions.length).toBe(0);
    });
  });
});
