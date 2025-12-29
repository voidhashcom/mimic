import { describe, it, expect, beforeEach, vi } from "vitest";
import * as Primitive from "../../src/Primitive";
import * as Transaction from "../../src/Transaction";
import * as Document from "../../src/Document";
import * as ServerDocument from "../../src/server/ServerDocument";

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

// Default initial state matching schema defaults
const defaultInitialState: TestState = {
  title: "",
  count: 0,
  items: [],
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Creates a transaction using a Document to generate valid ops.
 * Note: The proxy uses .set() method calls, not direct assignment.
 */
const createTransactionFromDoc = <TSchema extends Primitive.AnyPrimitive>(
  schema: TSchema,
  initialState: Primitive.InferState<TSchema> | undefined,
  fn: (root: Primitive.InferProxy<TSchema>) => void
): Transaction.Transaction => {
  const doc = Document.make(schema, { initialState: initialState });
  doc.transaction(fn);
  return doc.flush();
};

// =============================================================================
// ServerDocument Tests
// =============================================================================

describe("ServerDocument", () => {
  let broadcastMessages: ServerDocument.TransactionMessage[];
  let rejections: Array<{ transactionId: string; reason: string }>;
  let onBroadcast: (message: ServerDocument.TransactionMessage) => void;
  let onRejection: (transactionId: string, reason: string) => void;

  beforeEach(() => {
    broadcastMessages = [];
    rejections = [];
    onBroadcast = (message) => broadcastMessages.push(message);
    onRejection = (transactionId, reason) =>
      rejections.push({ transactionId, reason });
  });

  describe("make", () => {
    it("should create a server document with default state from schema", () => {
      const server = ServerDocument.make({
        schema: TestSchema,
        onBroadcast,
      });

      // Schema defaults may not include items array, check what we get
      const state = server.get();
      expect(state?.title).toBe("");
      expect(state?.count).toBe(0);
      expect(server.getVersion()).toBe(0);
    });

    it("should create a server document with initial state", () => {
      const initialState: TestState = {
        title: "Initial",
        count: 42,
        items: [],
      };

      const server = ServerDocument.make({
        schema: TestSchema,
        initialState,
        onBroadcast,
      });

      expect(server.get()).toEqual(initialState);
    });

    it("should create a server document with initial version", () => {
      const server = ServerDocument.make({
        schema: TestSchema,
        initialVersion: 100,
        onBroadcast,
      });

      expect(server.getVersion()).toBe(100);
    });
  });

  describe("submit", () => {
    it("should accept valid transactions and increment version", () => {
      const server = ServerDocument.make({
        schema: TestSchema,
        initialState: defaultInitialState,
        onBroadcast,
      });

      // Create a valid transaction using .set() method
      const tx = createTransactionFromDoc(
        TestSchema,
        defaultInitialState,
        (root) => {
          root.title.set("Updated Title");
        }
      );

      const result = server.submit(tx);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.version).toBe(1);
      }
      expect(server.get()?.title).toBe("Updated Title");
      expect(server.getVersion()).toBe(1);
    });

    it("should broadcast confirmed transactions", () => {
      const server = ServerDocument.make({
        schema: TestSchema,
        initialState: defaultInitialState,
        onBroadcast,
      });

      const tx = createTransactionFromDoc(
        TestSchema,
        defaultInitialState,
        (root) => {
          root.count.set(10);
        }
      );

      server.submit(tx);

      expect(broadcastMessages).toHaveLength(1);
      expect(broadcastMessages[0]).toEqual({
        type: "transaction",
        transaction: tx,
        version: 1,
      });
    });

    it("should reject empty transactions", () => {
      const server = ServerDocument.make({
        schema: TestSchema,
        initialState: defaultInitialState,
        onBroadcast,
        onRejection,
      });

      const emptyTx: Transaction.Transaction = {
        id: crypto.randomUUID(),
        ops: [],
        timestamp: Date.now(),
      };

      const result = server.submit(emptyTx);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe("Transaction is empty");
      }
      expect(server.getVersion()).toBe(0);
      expect(broadcastMessages).toHaveLength(0);
    });

    it("should reject duplicate transactions", () => {
      const server = ServerDocument.make({
        schema: TestSchema,
        initialState: defaultInitialState,
        onBroadcast,
        onRejection,
      });

      const tx = createTransactionFromDoc(
        TestSchema,
        defaultInitialState,
        (root) => {
          root.title.set("First");
        }
      );

      // Submit once - should succeed
      const result1 = server.submit(tx);
      expect(result1.success).toBe(true);

      // Submit again - should be rejected as duplicate
      const result2 = server.submit(tx);
      expect(result2.success).toBe(false);
      if (!result2.success) {
        expect(result2.reason).toBe("Transaction has already been processed");
      }

      // Version should not have incremented for duplicate
      expect(server.getVersion()).toBe(1);
      expect(broadcastMessages).toHaveLength(1);
    });

    it("should call onRejection callback for rejected transactions", () => {
      const server = ServerDocument.make({
        schema: TestSchema,
        initialState: defaultInitialState,
        onBroadcast,
        onRejection,
      });

      const emptyTx: Transaction.Transaction = {
        id: "test-tx-id",
        ops: [],
        timestamp: Date.now(),
      };

      server.submit(emptyTx);

      expect(rejections).toHaveLength(1);
      expect(rejections[0]).toEqual({
        transactionId: "test-tx-id",
        reason: "Transaction is empty",
      });
    });

    it("should apply multiple transactions in sequence", () => {
      const server = ServerDocument.make({
        schema: TestSchema,
        initialState: defaultInitialState,
        onBroadcast,
      });

      // First transaction
      const tx1 = createTransactionFromDoc(
        TestSchema,
        server.get(),
        (root) => {
          root.title.set("First");
        }
      );
      server.submit(tx1);

      // Second transaction
      const tx2 = createTransactionFromDoc(
        TestSchema,
        server.get(),
        (root) => {
          root.count.set(5);
        }
      );
      server.submit(tx2);

      // Third transaction
      const tx3 = createTransactionFromDoc(
        TestSchema,
        server.get(),
        (root) => {
          root.title.set("Third");
        }
      );
      server.submit(tx3);

      expect(server.getVersion()).toBe(3);
      expect(server.get()?.title).toBe("Third");
      expect(server.get()?.count).toBe(5);
      expect(broadcastMessages).toHaveLength(3);
    });
  });

  describe("getSnapshot", () => {
    it("should return current state and version as snapshot", () => {
      const initialState: TestState = {
        title: "Snapshot Test",
        count: 99,
        items: [],
      };

      const server = ServerDocument.make({
        schema: TestSchema,
        initialState,
        initialVersion: 50,
        onBroadcast,
      });

      const snapshot = server.getSnapshot();

      expect(snapshot).toEqual({
        type: "snapshot",
        state: initialState,
        version: 50,
      });
    });

    it("should return updated snapshot after transactions", () => {
      const server = ServerDocument.make({
        schema: TestSchema,
        initialState: defaultInitialState,
        onBroadcast,
      });

      const tx = createTransactionFromDoc(
        TestSchema,
        defaultInitialState,
        (root) => {
          root.title.set("After Transaction");
          root.count.set(42);
        }
      );
      server.submit(tx);

      const snapshot = server.getSnapshot();

      expect(snapshot.type).toBe("snapshot");
      expect(snapshot.version).toBe(1);
      expect((snapshot.state as TestState)?.title).toBe("After Transaction");
      expect((snapshot.state as TestState)?.count).toBe(42);
    });
  });

  describe("hasProcessed", () => {
    it("should return false for unprocessed transactions", () => {
      const server = ServerDocument.make({
        schema: TestSchema,
        initialState: defaultInitialState,
        onBroadcast,
      });

      expect(server.hasProcessed("unknown-tx-id")).toBe(false);
    });

    it("should return true for processed transactions", () => {
      const server = ServerDocument.make({
        schema: TestSchema,
        initialState: defaultInitialState,
        onBroadcast,
      });

      const tx = createTransactionFromDoc(
        TestSchema,
        defaultInitialState,
        (root) => {
          root.title.set("Test");
        }
      );
      server.submit(tx);

      expect(server.hasProcessed(tx.id)).toBe(true);
    });

    it("should evict old transaction IDs when over limit", () => {
      const server = ServerDocument.make({
        schema: TestSchema,
        initialState: defaultInitialState,
        onBroadcast,
        maxTransactionHistory: 3,
      });

      const txIds: string[] = [];

      // Submit 5 transactions (limit is 3)
      for (let i = 0; i < 5; i++) {
        const tx = createTransactionFromDoc(
          TestSchema,
          server.get(),
          (root) => {
            root.count.set(i);
          }
        );
        txIds.push(tx.id);
        server.submit(tx);
      }

      // First 2 should have been evicted
      expect(server.hasProcessed(txIds[0]!)).toBe(false);
      expect(server.hasProcessed(txIds[1]!)).toBe(false);

      // Last 3 should still be tracked
      expect(server.hasProcessed(txIds[2]!)).toBe(true);
      expect(server.hasProcessed(txIds[3]!)).toBe(true);
      expect(server.hasProcessed(txIds[4]!)).toBe(true);
    });
  });

  describe("array operations", () => {
    it("should handle array insert operations", () => {
      const server = ServerDocument.make({
        schema: TestSchema,
        initialState: defaultInitialState,
        onBroadcast,
      });

      const tx = createTransactionFromDoc(
        TestSchema,
        defaultInitialState,
        (root) => {
          root.items.push({ name: "Item 1", done: false });
        }
      );

      const result = server.submit(tx);

      expect(result.success).toBe(true);
      expect(server.get()?.items).toHaveLength(1);
      expect(server.get()?.items[0]?.value.name).toBe("Item 1");
    });

    it("should handle multiple array operations", () => {
      const server = ServerDocument.make({
        schema: TestSchema,
        initialState: defaultInitialState,
        onBroadcast,
      });

      // Insert first item
      const tx1 = createTransactionFromDoc(
        TestSchema,
        server.get(),
        (root) => {
          root.items.push({ name: "Item 1", done: false });
        }
      );
      server.submit(tx1);

      // Insert second item
      const tx2 = createTransactionFromDoc(
        TestSchema,
        server.get(),
        (root) => {
          root.items.push({ name: "Item 2", done: true });
        }
      );
      server.submit(tx2);

      expect(server.get()?.items).toHaveLength(2);
      expect(server.getVersion()).toBe(2);
    });
  });

  describe("state isolation", () => {
    it("should not affect state on rejected transactions", () => {
      const initialState: TestState = {
        title: "Original",
        count: 0,
        items: [],
      };

      const server = ServerDocument.make({
        schema: TestSchema,
        initialState,
        onBroadcast,
      });

      // Submit empty transaction (will be rejected)
      const emptyTx: Transaction.Transaction = {
        id: crypto.randomUUID(),
        ops: [],
        timestamp: Date.now(),
      };
      server.submit(emptyTx);

      // State should be unchanged
      expect(server.get()).toEqual(initialState);
    });
  });

  describe("concurrent simulation", () => {
    it("should handle interleaved transactions from different clients", () => {
      const server = ServerDocument.make({
        schema: TestSchema,
        initialState: defaultInitialState,
        onBroadcast,
      });

      // Simulate Client A and Client B submitting interleaved transactions
      // Client A sets title
      const txA1 = createTransactionFromDoc(
        TestSchema,
        server.get(),
        (root) => {
          root.title.set("Client A Title");
        }
      );
      server.submit(txA1);

      // Client B sets count
      const txB1 = createTransactionFromDoc(
        TestSchema,
        server.get(),
        (root) => {
          root.count.set(100);
        }
      );
      server.submit(txB1);

      // Client A updates title again
      const txA2 = createTransactionFromDoc(
        TestSchema,
        server.get(),
        (root) => {
          root.title.set("Client A Final");
        }
      );
      server.submit(txA2);

      expect(server.getVersion()).toBe(3);
      expect(server.get()?.title).toBe("Client A Final");
      expect(server.get()?.count).toBe(100);

      // All broadcasts should have incremental versions
      expect(broadcastMessages[0]?.version).toBe(1);
      expect(broadcastMessages[1]?.version).toBe(2);
      expect(broadcastMessages[2]?.version).toBe(3);
    });
  });
});
