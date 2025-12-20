import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import * as Layer from "effect/Layer";
import * as Fiber from "effect/Fiber";
import { Primitive, OperationPath, Document, Transaction } from "@voidhash/mimic";
import * as DocumentManager from "../src/DocumentManager";
import * as MimicConfig from "../src/MimicConfig";
import * as InMemoryDataStorage from "../src/storage/InMemoryDataStorage";

// =============================================================================
// Test Schema
// =============================================================================

const TestSchema = Primitive.Struct({
  title: Primitive.String().default(""),
  count: Primitive.Number().default(0),
});

// =============================================================================
// Test Layer
// =============================================================================

const makeTestLayer = () => {
  const configLayer = MimicConfig.layer({
    schema: TestSchema,
    maxTransactionHistory: 100,
  });

  return DocumentManager.layer.pipe(
    Layer.provide(configLayer),
    Layer.provide(InMemoryDataStorage.layer)
  );
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a valid operation using the Document API
 */
const createValidTransaction = (id: string, title: string): Transaction.Transaction => {
  const doc = Document.make(TestSchema);
  doc.transaction((root) => {
    root.title.set(title);
  });
  const tx = doc.flush();
  // Override the ID to make it deterministic for tests
  return {
    ...tx,
    id,
  };
};

const createEmptyTransaction = (id: string): Transaction.Transaction => ({
  id,
  ops: [],
  timestamp: Date.now(),
});

// =============================================================================
// DocumentManager Tests
// =============================================================================

describe("DocumentManager", () => {
  describe("submit", () => {
    it("should accept valid transactions", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const manager = yield* DocumentManager.DocumentManagerTag;
          const tx = createValidTransaction("tx-1", "Hello World");
          return yield* manager.submit("doc-1", tx);
        }).pipe(Effect.provide(makeTestLayer()))
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.version).toBe(1);
      }
    });

    it("should reject empty transactions", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const manager = yield* DocumentManager.DocumentManagerTag;
          const tx = createEmptyTransaction("tx-empty");
          return yield* manager.submit("doc-1", tx);
        }).pipe(Effect.provide(makeTestLayer()))
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe("Transaction is empty");
      }
    });

    it("should reject duplicate transactions", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const manager = yield* DocumentManager.DocumentManagerTag;
          const tx = createValidTransaction("tx-dup", "First");

          // Submit first time
          const first = yield* manager.submit("doc-1", tx);

          // Submit same transaction again
          const second = yield* manager.submit("doc-1", tx);

          return { first, second };
        }).pipe(Effect.provide(makeTestLayer()))
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
          const manager = yield* DocumentManager.DocumentManagerTag;

          const tx1 = createValidTransaction("tx-1", "One");
          const tx2 = createValidTransaction("tx-2", "Two");
          const tx3 = createValidTransaction("tx-3", "Three");

          const r1 = yield* manager.submit("doc-1", tx1);
          const r2 = yield* manager.submit("doc-1", tx2);
          const r3 = yield* manager.submit("doc-1", tx3);

          return { r1, r2, r3 };
        }).pipe(Effect.provide(makeTestLayer()))
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

    it("should handle different documents independently", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const manager = yield* DocumentManager.DocumentManagerTag;

          const txDoc1 = createValidTransaction("tx-doc1", "Doc 1");
          const txDoc2 = createValidTransaction("tx-doc2", "Doc 2");

          const r1 = yield* manager.submit("doc-1", txDoc1);
          const r2 = yield* manager.submit("doc-2", txDoc2);

          return { r1, r2 };
        }).pipe(Effect.provide(makeTestLayer()))
      );

      expect(result.r1.success).toBe(true);
      expect(result.r2.success).toBe(true);

      // Both should have version 1 since they are independent documents
      if (result.r1.success && result.r2.success) {
        expect(result.r1.version).toBe(1);
        expect(result.r2.version).toBe(1);
      }
    });
  });

  describe("getSnapshot", () => {
    it("should return initial snapshot for new document", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const manager = yield* DocumentManager.DocumentManagerTag;
          return yield* manager.getSnapshot("new-doc");
        }).pipe(Effect.provide(makeTestLayer()))
      );

      expect(result.type).toBe("snapshot");
      expect(result.version).toBe(0);
      // Initial state from schema defaults
      expect(result.state).toEqual({ title: "", count: 0 });
    });

    it("should return current state after transactions", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const manager = yield* DocumentManager.DocumentManagerTag;

          // Apply a transaction
          const tx = createValidTransaction("tx-1", "Updated Title");
          yield* manager.submit("doc-1", tx);

          return yield* manager.getSnapshot("doc-1");
        }).pipe(Effect.provide(makeTestLayer()))
      );

      expect(result.type).toBe("snapshot");
      expect(result.version).toBe(1);
      expect((result.state as any).title).toBe("Updated Title");
    });

    it("should return snapshot for specific document", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const manager = yield* DocumentManager.DocumentManagerTag;

          // Apply transactions to different documents
          const tx1 = createValidTransaction("tx-1", "Doc One");
          const tx2 = createValidTransaction("tx-2", "Doc Two");

          yield* manager.submit("doc-1", tx1);
          yield* manager.submit("doc-2", tx2);

          const snap1 = yield* manager.getSnapshot("doc-1");
          const snap2 = yield* manager.getSnapshot("doc-2");

          return { snap1, snap2 };
        }).pipe(Effect.provide(makeTestLayer()))
      );

      expect((result.snap1.state as any).title).toBe("Doc One");
      expect((result.snap2.state as any).title).toBe("Doc Two");
    });
  });

  describe("subscribe", () => {
    it("should receive broadcasts for submitted transactions", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const manager = yield* DocumentManager.DocumentManagerTag;

          // Subscribe to the document
          const broadcastStream = yield* manager.subscribe("doc-1");

          // Submit a transaction
          const tx = createValidTransaction("tx-broadcast", "Broadcast Test");

          // Start collecting broadcasts in parallel
          const collectFiber = yield* Effect.fork(
            broadcastStream.pipe(Stream.take(1), Stream.runCollect)
          );

          // Small delay to ensure subscription is ready
          yield* Effect.sleep(50);

          // Submit the transaction
          yield* manager.submit("doc-1", tx);

          // Wait for the broadcast with Fiber.join
          const broadcasts = yield* Fiber.join(collectFiber).pipe(
            Effect.timeout(2000)
          );

          return broadcasts;
        }).pipe(Effect.scoped, Effect.provide(makeTestLayer()))
      );

      expect(result).toBeDefined();
      if (result) {
        const broadcasts = Array.from(result);
        expect(broadcasts.length).toBe(1);
        expect(broadcasts[0].type).toBe("transaction");
      }
    });

    it("should broadcast to multiple subscribers", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const manager = yield* DocumentManager.DocumentManagerTag;

          // Subscribe twice to the same document
          const stream1 = yield* manager.subscribe("doc-1");
          const stream2 = yield* manager.subscribe("doc-1");

          // Start collecting broadcasts in parallel
          const collectFiber1 = yield* Effect.fork(
            stream1.pipe(Stream.take(1), Stream.runCollect)
          );
          const collectFiber2 = yield* Effect.fork(
            stream2.pipe(Stream.take(1), Stream.runCollect)
          );

          // Small delay to ensure subscriptions are ready
          yield* Effect.sleep(50);

          // Submit a transaction
          const tx = createValidTransaction("tx-multi", "Multi Broadcast");
          yield* manager.submit("doc-1", tx);

          // Wait for both broadcasts with Fiber.join
          const broadcasts1 = yield* Fiber.join(collectFiber1).pipe(
            Effect.timeout(2000)
          );
          const broadcasts2 = yield* Fiber.join(collectFiber2).pipe(
            Effect.timeout(2000)
          );

          return { broadcasts1, broadcasts2 };
        }).pipe(Effect.scoped, Effect.provide(makeTestLayer()))
      );

      expect(result.broadcasts1).toBeDefined();
      expect(result.broadcasts2).toBeDefined();
      if (result.broadcasts1 && result.broadcasts2) {
        expect(Array.from(result.broadcasts1).length).toBe(1);
        expect(Array.from(result.broadcasts2).length).toBe(1);
      }
    });
  });

  describe("DocumentManagerTag", () => {
    it("should have the correct tag identifier", () => {
      expect(DocumentManager.DocumentManagerTag.key).toBe(
        "@voidhash/mimic-server-effect/DocumentManager"
      );
    });
  });

  describe("layer", () => {
    it("should require MimicServerConfigTag and MimicDataStorageTag", async () => {
      // This test verifies the layer composition works correctly
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const manager = yield* DocumentManager.DocumentManagerTag;
          return typeof manager.submit === "function";
        }).pipe(Effect.provide(makeTestLayer()))
      );

      expect(result).toBe(true);
    });
  });
});
