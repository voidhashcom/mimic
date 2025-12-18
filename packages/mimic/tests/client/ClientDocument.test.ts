import { describe, it, expect, beforeEach } from "vitest";
import * as Primitive from "../../src/Primitive";
import * as Transaction from "../../src/Transaction";
import * as OperationPath from "../../src/OperationPath";
import * as ClientDocument from "../../src/client/ClientDocument";
import type * as Transport from "../../src/client/Transport";
import * as Rebase from "../../src/client/Rebase";
import * as StateMonitor from "../../src/client/StateMonitor";

// =============================================================================
// Mock Transport
// =============================================================================

interface MockTransport extends Transport.Transport {
  sentTransactions: Transaction.Transaction[];
  handlers: Set<(message: Transport.ServerMessage) => void>;
  simulateServerMessage: (message: Transport.ServerMessage) => void;
  snapshotRequested: boolean;
  autoSendSnapshot?: { state: unknown; version: number };
}

const createMockTransport = (options?: {
  autoSendSnapshot?: { state: unknown; version: number };
}): MockTransport => {
  const handlers = new Set<(message: Transport.ServerMessage) => void>();
  const sentTransactions: Transaction.Transaction[] = [];
  let _connected = false;
  let snapshotRequested = false;

  const transport: MockTransport = {
    sentTransactions,
    handlers,
    snapshotRequested,
    autoSendSnapshot: options?.autoSendSnapshot,

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

    it("should throw when not connected", () => {
      const client = ClientDocument.make({
        schema: TestSchema,
        transport,
        initialState: { title: "", count: 0, items: [] },
      });

      expect(() => {
        client.transaction((root) => {
          root.title.set("Test");
        });
      }).toThrow("Transport is not connected");
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
