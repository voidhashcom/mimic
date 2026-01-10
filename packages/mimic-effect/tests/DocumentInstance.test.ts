import { describe, it, expect } from "vitest";
import { Effect, Duration, Stream, Fiber } from "effect";
import { Primitive, Document, Transaction } from "@voidhash/mimic";
import { DocumentInstance, type SubmitResult } from "../src/DocumentInstance";
import { ColdStorage, ColdStorageTag } from "../src/ColdStorage";
import { HotStorage, HotStorageTag } from "../src/HotStorage";

// =============================================================================
// Test Schema
// =============================================================================

const TestSchema = Primitive.Struct({
  title: Primitive.String().default(""),
  count: Primitive.Number().default(0),
});

// =============================================================================
// Helper Functions
// =============================================================================

const createValidTransaction = (
  id: string,
  title: string
): Transaction.Transaction => {
  const doc = Document.make(TestSchema);
  doc.transaction((root) => {
    root.title.set(title);
  });
  const tx = doc.flush();
  return { ...tx, id };
};

const createEmptyTransaction = (id: string): Transaction.Transaction => ({
  id,
  ops: [],
  timestamp: Date.now(),
});

// =============================================================================
// Test Config Factory
// =============================================================================

const makeTestConfig = (options?: {
  initial?: { title?: string; count?: number };
}) => ({
  schema: TestSchema,
  initial: options?.initial,
  maxTransactionHistory: 100,
  snapshot: {
    interval: Duration.minutes(5),
    transactionThreshold: 100,
  },
});

// =============================================================================
// DocumentInstance Tests
// =============================================================================

describe("DocumentInstance", () => {
  describe("make", () => {
    it("should create a new document instance", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const coldStorage = yield* ColdStorageTag;
          const hotStorage = yield* HotStorageTag;

          const instance = yield* DocumentInstance.make(
            "doc-1",
            makeTestConfig(),
            coldStorage,
            hotStorage
          );

          return {
            hasDocument: instance.document !== undefined,
            hasPubsub: instance.pubsub !== undefined,
            hasSubmit: typeof instance.submit === "function",
            hasGetSnapshot: typeof instance.getSnapshot === "function",
            hasSaveSnapshot: typeof instance.saveSnapshot === "function",
          };
        }).pipe(
          Effect.provide(ColdStorage.InMemory.make()),
          Effect.provide(HotStorage.InMemory.make())
        )
      );

      expect(result.hasDocument).toBe(true);
      expect(result.hasPubsub).toBe(true);
      expect(result.hasSubmit).toBe(true);
      expect(result.hasGetSnapshot).toBe(true);
      expect(result.hasSaveSnapshot).toBe(true);
    });

    it("should initialize with default state when no initial provided", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const coldStorage = yield* ColdStorageTag;
          const hotStorage = yield* HotStorageTag;

          const instance = yield* DocumentInstance.make(
            "doc-default",
            makeTestConfig(),
            coldStorage,
            hotStorage
          );

          return instance.getSnapshot();
        }).pipe(
          Effect.provide(ColdStorage.InMemory.make()),
          Effect.provide(HotStorage.InMemory.make())
        )
      );

      expect(result.version).toBe(0);
      expect(result.state).toEqual({ title: "", count: 0 });
    });

    it("should use initial state for new documents", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const coldStorage = yield* ColdStorageTag;
          const hotStorage = yield* HotStorageTag;

          const instance = yield* DocumentInstance.make(
            "doc-initial",
            makeTestConfig({ initial: { title: "Initial Title", count: 42 } }),
            coldStorage,
            hotStorage
          );

          return instance.getSnapshot();
        }).pipe(
          Effect.provide(ColdStorage.InMemory.make()),
          Effect.provide(HotStorage.InMemory.make())
        )
      );

      expect(result.version).toBe(0);
      expect(result.state).toEqual({ title: "Initial Title", count: 42 });
    });

    it("should restore from cold storage if document exists", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const coldStorage = yield* ColdStorageTag;
          const hotStorage = yield* HotStorageTag;

          // Pre-populate cold storage
          yield* coldStorage.save("doc-restore", {
            state: { title: "Restored", count: 100 },
            version: 5,
            schemaVersion: 1,
            savedAt: Date.now(),
          });

          const instance = yield* DocumentInstance.make(
            "doc-restore",
            makeTestConfig(),
            coldStorage,
            hotStorage
          );

          return instance.getSnapshot();
        }).pipe(
          Effect.provide(ColdStorage.InMemory.make()),
          Effect.provide(HotStorage.InMemory.make())
        )
      );

      expect(result.version).toBe(5);
      expect(result.state).toEqual({ title: "Restored", count: 100 });
    });
  });

  describe("submit", () => {
    it("should accept valid transactions", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const coldStorage = yield* ColdStorageTag;
          const hotStorage = yield* HotStorageTag;

          const instance = yield* DocumentInstance.make(
            "doc-submit-1",
            makeTestConfig(),
            coldStorage,
            hotStorage
          );

          const tx = createValidTransaction("tx-1", "Hello World");
          return yield* instance.submit(tx);
        }).pipe(
          Effect.provide(ColdStorage.InMemory.make()),
          Effect.provide(HotStorage.InMemory.make())
        )
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.version).toBe(1);
      }
    });

    it("should reject empty transactions", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const coldStorage = yield* ColdStorageTag;
          const hotStorage = yield* HotStorageTag;

          const instance = yield* DocumentInstance.make(
            "doc-submit-empty",
            makeTestConfig(),
            coldStorage,
            hotStorage
          );

          const tx = createEmptyTransaction("tx-empty");
          return yield* instance.submit(tx);
        }).pipe(
          Effect.provide(ColdStorage.InMemory.make()),
          Effect.provide(HotStorage.InMemory.make())
        )
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe("Transaction is empty");
      }
    });

    it("should reject duplicate transactions", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const coldStorage = yield* ColdStorageTag;
          const hotStorage = yield* HotStorageTag;

          const instance = yield* DocumentInstance.make(
            "doc-submit-dup",
            makeTestConfig(),
            coldStorage,
            hotStorage
          );

          const tx = createValidTransaction("tx-dup", "First");

          const first = yield* instance.submit(tx);
          const second = yield* instance.submit(tx);

          return { first, second };
        }).pipe(
          Effect.provide(ColdStorage.InMemory.make()),
          Effect.provide(HotStorage.InMemory.make())
        )
      );

      expect(result.first.success).toBe(true);
      expect(result.second.success).toBe(false);
      if (!result.second.success) {
        expect(result.second.reason).toBe(
          "Transaction has already been processed"
        );
      }
    });

    it("should increment version with each successful transaction", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const coldStorage = yield* ColdStorageTag;
          const hotStorage = yield* HotStorageTag;

          const instance = yield* DocumentInstance.make(
            "doc-submit-versions",
            makeTestConfig(),
            coldStorage,
            hotStorage
          );

          const tx1 = createValidTransaction("tx-1", "One");
          const tx2 = createValidTransaction("tx-2", "Two");
          const tx3 = createValidTransaction("tx-3", "Three");

          const r1 = yield* instance.submit(tx1);
          const r2 = yield* instance.submit(tx2);
          const r3 = yield* instance.submit(tx3);

          return { r1, r2, r3 };
        }).pipe(
          Effect.provide(ColdStorage.InMemory.make()),
          Effect.provide(HotStorage.InMemory.make())
        )
      );

      expect(result.r1.success).toBe(true);
      expect(result.r2.success).toBe(true);
      expect(result.r3.success).toBe(true);

      if (result.r1.success && result.r2.success && result.r3.success) {
        expect(result.r1.version).toBe(1);
        expect(result.r2.version).toBe(2);
        expect(result.r3.version).toBe(3);
      }
    });

    it("should persist transactions to WAL", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const coldStorage = yield* ColdStorageTag;
          const hotStorage = yield* HotStorageTag;

          const instance = yield* DocumentInstance.make(
            "doc-wal",
            makeTestConfig(),
            coldStorage,
            hotStorage
          );

          const tx1 = createValidTransaction("tx-1", "First");
          const tx2 = createValidTransaction("tx-2", "Second");

          yield* instance.submit(tx1);
          yield* instance.submit(tx2);

          // Check WAL entries
          const entries = yield* hotStorage.getEntries("doc-wal", 0);
          return entries;
        }).pipe(
          Effect.provide(ColdStorage.InMemory.make()),
          Effect.provide(HotStorage.InMemory.make())
        )
      );

      expect(result.length).toBe(2);
      expect(result[0]!.version).toBe(1);
      expect(result[1]!.version).toBe(2);
    });
  });

  describe("getSnapshot", () => {
    it("should return current state after transactions", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const coldStorage = yield* ColdStorageTag;
          const hotStorage = yield* HotStorageTag;

          const instance = yield* DocumentInstance.make(
            "doc-snapshot",
            makeTestConfig({ initial: { title: "Initial" } }),
            coldStorage,
            hotStorage
          );

          const tx = createValidTransaction("tx-1", "Updated Title");
          yield* instance.submit(tx);

          return instance.getSnapshot();
        }).pipe(
          Effect.provide(ColdStorage.InMemory.make()),
          Effect.provide(HotStorage.InMemory.make())
        )
      );

      expect(result.version).toBe(1);
      expect((result.state as { title: string }).title).toBe("Updated Title");
    });
  });

  describe("getVersion", () => {
    it("should return current version", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const coldStorage = yield* ColdStorageTag;
          const hotStorage = yield* HotStorageTag;

          const instance = yield* DocumentInstance.make(
            "doc-version",
            makeTestConfig(),
            coldStorage,
            hotStorage
          );

          const v0 = instance.getVersion();

          const tx1 = createValidTransaction("tx-1", "First");
          yield* instance.submit(tx1);
          const v1 = instance.getVersion();

          const tx2 = createValidTransaction("tx-2", "Second");
          yield* instance.submit(tx2);
          const v2 = instance.getVersion();

          return { v0, v1, v2 };
        }).pipe(
          Effect.provide(ColdStorage.InMemory.make()),
          Effect.provide(HotStorage.InMemory.make())
        )
      );

      expect(result.v0).toBe(0);
      expect(result.v1).toBe(1);
      expect(result.v2).toBe(2);
    });
  });

  describe("touch", () => {
    it("should update activity time without error", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const coldStorage = yield* ColdStorageTag;
          const hotStorage = yield* HotStorageTag;

          const instance = yield* DocumentInstance.make(
            "doc-touch",
            makeTestConfig(),
            coldStorage,
            hotStorage
          );

          yield* instance.touch();
          return true;
        }).pipe(
          Effect.provide(ColdStorage.InMemory.make()),
          Effect.provide(HotStorage.InMemory.make())
        )
      );

      expect(result).toBe(true);
    });
  });

  describe("pubsub broadcasts", () => {
    it("should broadcast transactions to subscribers", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const coldStorage = yield* ColdStorageTag;
          const hotStorage = yield* HotStorageTag;

          const instance = yield* DocumentInstance.make(
            "doc-broadcast",
            makeTestConfig(),
            coldStorage,
            hotStorage
          );

          // Subscribe to broadcasts
          const broadcastStream = Stream.fromPubSub(instance.pubsub);

          // Start collecting in background
          const collectFiber = yield* Effect.fork(
            broadcastStream.pipe(Stream.take(1), Stream.runCollect)
          );

          // Wait a bit for subscription to be ready
          yield* Effect.sleep(50);

          // Submit a transaction
          const tx = createValidTransaction("tx-broadcast", "Broadcast Test");
          yield* instance.submit(tx);

          // Wait for broadcast
          const broadcasts = yield* Fiber.join(collectFiber).pipe(
            Effect.timeout(2000)
          );

          return broadcasts;
        }).pipe(
          Effect.provide(ColdStorage.InMemory.make()),
          Effect.provide(HotStorage.InMemory.make())
        )
      );

      expect(result).toBeDefined();
      if (result) {
        const broadcasts = Array.from(result);
        expect(broadcasts.length).toBe(1);
        expect(broadcasts[0]!.type).toBe("transaction");
      }
    });
  });

  describe("getSnapshotTracking", () => {
    it("should track snapshot state", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const coldStorage = yield* ColdStorageTag;
          const hotStorage = yield* HotStorageTag;

          const instance = yield* DocumentInstance.make(
            "doc-tracking",
            makeTestConfig(),
            coldStorage,
            hotStorage
          );

          const initialTracking = yield* instance.getSnapshotTracking;

          // Submit some transactions
          yield* instance.submit(createValidTransaction("tx-1", "One"));
          yield* instance.submit(createValidTransaction("tx-2", "Two"));

          const afterTracking = yield* instance.getSnapshotTracking;

          return { initialTracking, afterTracking };
        }).pipe(
          Effect.provide(ColdStorage.InMemory.make()),
          Effect.provide(HotStorage.InMemory.make())
        )
      );

      expect(result.initialTracking.transactionsSinceSnapshot).toBe(0);
      expect(result.afterTracking.transactionsSinceSnapshot).toBe(2);
    });
  });

  describe("saveSnapshot", () => {
    it("should save snapshot to cold storage", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const coldStorage = yield* ColdStorageTag;
          const hotStorage = yield* HotStorageTag;

          const instance = yield* DocumentInstance.make(
            "doc-save-snapshot",
            makeTestConfig(),
            coldStorage,
            hotStorage
          );

          // Submit some transactions
          yield* instance.submit(createValidTransaction("tx-1", "Final Title"));

          // Save snapshot manually
          yield* instance.saveSnapshot();

          // Verify cold storage was updated
          const stored = yield* coldStorage.load("doc-save-snapshot");
          return stored;
        }).pipe(
          Effect.provide(ColdStorage.InMemory.make()),
          Effect.provide(HotStorage.InMemory.make())
        )
      );

      expect(result).toBeDefined();
      expect(result!.version).toBe(1);
      expect((result!.state as { title: string }).title).toBe("Final Title");
    });

    it("should be idempotent when called multiple times at same version", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const coldStorage = yield* ColdStorageTag;
          const hotStorage = yield* HotStorageTag;

          const instance = yield* DocumentInstance.make(
            "doc-idempotent-snapshot",
            makeTestConfig(),
            coldStorage,
            hotStorage
          );

          yield* instance.submit(createValidTransaction("tx-1", "Test"));

          // Save snapshot multiple times
          yield* instance.saveSnapshot();
          yield* instance.saveSnapshot();
          yield* instance.saveSnapshot();

          return true;
        }).pipe(
          Effect.provide(ColdStorage.InMemory.make()),
          Effect.provide(HotStorage.InMemory.make())
        )
      );

      expect(result).toBe(true);
    });
  });

  describe("WAL replay", () => {
    it("should replay WAL entries on restore", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const coldStorage = yield* ColdStorageTag;
          const hotStorage = yield* HotStorageTag;

          // Pre-populate cold storage with base state
          yield* coldStorage.save("doc-wal-replay", {
            state: { title: "Base", count: 0 },
            version: 0,
            schemaVersion: 1,
            savedAt: Date.now(),
          });

          // Pre-populate WAL with entries
          const tx1 = createValidTransaction("tx-1", "After WAL 1");
          yield* hotStorage.append("doc-wal-replay", {
            transaction: tx1,
            version: 1,
            timestamp: Date.now(),
          });

          const tx2 = createValidTransaction("tx-2", "After WAL 2");
          yield* hotStorage.append("doc-wal-replay", {
            transaction: tx2,
            version: 2,
            timestamp: Date.now(),
          });

          // Create instance - should replay WAL
          const instance = yield* DocumentInstance.make(
            "doc-wal-replay",
            makeTestConfig(),
            coldStorage,
            hotStorage
          );

          return instance.getSnapshot();
        }).pipe(
          Effect.provide(ColdStorage.InMemory.make()),
          Effect.provide(HotStorage.InMemory.make())
        )
      );

      // Version should reflect replayed WAL
      expect(result.version).toBe(2);
      expect((result.state as { title: string }).title).toBe("After WAL 2");
    });
  });

  describe("initial state function", () => {
    it("should support initial state as effect function", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const coldStorage = yield* ColdStorageTag;
          const hotStorage = yield* HotStorageTag;

          const instance = yield* DocumentInstance.make(
            "doc-dynamic-initial",
            {
              schema: TestSchema,
              initial: (ctx) =>
                Effect.succeed({
                  title: `Document: ${ctx.documentId}`,
                  count: 100,
                }),
              maxTransactionHistory: 100,
              snapshot: {
                interval: Duration.minutes(5),
                transactionThreshold: 100,
              },
            },
            coldStorage,
            hotStorage
          );

          return instance.getSnapshot();
        }).pipe(
          Effect.provide(ColdStorage.InMemory.make()),
          Effect.provide(HotStorage.InMemory.make())
        )
      );

      expect(result.version).toBe(0);
      expect(result.state).toEqual({
        title: "Document: doc-dynamic-initial",
        count: 100,
      });
    });
  });
});
