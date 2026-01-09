import { describe, it, expect } from "vitest";
import { Effect, Layer, Stream, Fiber, Duration } from "effect";
import { Primitive, Document, Transaction } from "@voidhash/mimic";
import {
  DocumentManager,
  DocumentManagerTag,
  DocumentManagerConfigTag,
} from "../src/DocumentManager";
import { ColdStorage } from "../src/ColdStorage";
import { HotStorage } from "../src/HotStorage";
import type { ResolvedConfig } from "../src/Types";

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

const makeTestLayer = (options?: {
  initial?: { title?: string; count?: number };
}) => {
  const config: ResolvedConfig<typeof TestSchema> = {
    schema: TestSchema,
    initial: options?.initial,
    presence: undefined,
    maxIdleTime: Duration.minutes(5),
    maxTransactionHistory: 100,
    snapshot: {
      interval: Duration.minutes(5),
      transactionThreshold: 100,
    },
  };

  const configLayer = Layer.succeed(
    DocumentManagerConfigTag,
    config as ResolvedConfig<Primitive.AnyPrimitive>
  );

  return DocumentManager.layer.pipe(
    Layer.provide(configLayer),
    Layer.provide(ColdStorage.InMemory.make()),
    Layer.provide(HotStorage.InMemory.make())
  );
};

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
// DocumentManager Tests
// =============================================================================

describe("DocumentManager", () => {
  describe("submit", () => {
    it("should accept valid transactions", async () => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const manager = yield* DocumentManagerTag;
            const tx = createValidTransaction("tx-1", "Hello World");
            return yield* manager.submit("doc-1", tx);
          })
        ).pipe(Effect.provide(makeTestLayer()))
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.version).toBe(1);
      }
    });

    it("should reject empty transactions", async () => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const manager = yield* DocumentManagerTag;
            const tx = createEmptyTransaction("tx-empty");
            return yield* manager.submit("doc-1", tx);
          })
        ).pipe(Effect.provide(makeTestLayer()))
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.reason).toBe("Transaction is empty");
      }
    });

    it("should reject duplicate transactions", async () => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const manager = yield* DocumentManagerTag;
            const tx = createValidTransaction("tx-dup", "First");

            const first = yield* manager.submit("doc-1", tx);
            const second = yield* manager.submit("doc-1", tx);

            return { first, second };
          })
        ).pipe(Effect.provide(makeTestLayer()))
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
        Effect.scoped(
          Effect.gen(function* () {
            const manager = yield* DocumentManagerTag;

            const tx1 = createValidTransaction("tx-1", "One");
            const tx2 = createValidTransaction("tx-2", "Two");
            const tx3 = createValidTransaction("tx-3", "Three");

            const r1 = yield* manager.submit("doc-1", tx1);
            const r2 = yield* manager.submit("doc-1", tx2);
            const r3 = yield* manager.submit("doc-1", tx3);

            return { r1, r2, r3 };
          })
        ).pipe(Effect.provide(makeTestLayer()))
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
        Effect.scoped(
          Effect.gen(function* () {
            const manager = yield* DocumentManagerTag;

            const txDoc1 = createValidTransaction("tx-doc1", "Doc 1");
            const txDoc2 = createValidTransaction("tx-doc2", "Doc 2");

            const r1 = yield* manager.submit("doc-1", txDoc1);
            const r2 = yield* manager.submit("doc-2", txDoc2);

            return { r1, r2 };
          })
        ).pipe(Effect.provide(makeTestLayer()))
      );

      expect(result.r1.success).toBe(true);
      expect(result.r2.success).toBe(true);

      if (result.r1.success && result.r2.success) {
        expect(result.r1.version).toBe(1);
        expect(result.r2.version).toBe(1);
      }
    });
  });

  describe("getSnapshot", () => {
    it("should return initial snapshot for new document", async () => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const manager = yield* DocumentManagerTag;
            return yield* manager.getSnapshot("new-doc");
          })
        ).pipe(Effect.provide(makeTestLayer()))
      );

      expect(result.type).toBe("snapshot");
      expect(result.version).toBe(0);
      expect(result.state).toEqual({ title: "", count: 0 });
    });

    it("should return current state after transactions", async () => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const manager = yield* DocumentManagerTag;

            const tx = createValidTransaction("tx-1", "Updated Title");
            yield* manager.submit("doc-1", tx);

            return yield* manager.getSnapshot("doc-1");
          })
        ).pipe(Effect.provide(makeTestLayer()))
      );

      expect(result.type).toBe("snapshot");
      expect(result.version).toBe(1);
      expect((result.state as { title: string }).title).toBe("Updated Title");
    });

    it("should use initial state for new documents", async () => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const manager = yield* DocumentManagerTag;
            return yield* manager.getSnapshot("new-doc");
          })
        ).pipe(
          Effect.provide(
            makeTestLayer({ initial: { title: "Initial Title", count: 42 } })
          )
        )
      );

      expect(result.type).toBe("snapshot");
      expect(result.version).toBe(0);
      expect(result.state).toEqual({ title: "Initial Title", count: 42 });
    });
  });

  describe("subscribe", () => {
    it("should receive broadcasts for submitted transactions", async () => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const manager = yield* DocumentManagerTag;

            const broadcastStream = yield* manager.subscribe("doc-1");

            const collectFiber = yield* Effect.fork(
              broadcastStream.pipe(Stream.take(1), Stream.runCollect)
            );

            yield* Effect.sleep(50);

            const tx = createValidTransaction("tx-broadcast", "Broadcast Test");
            yield* manager.submit("doc-1", tx);

            const broadcasts = yield* Fiber.join(collectFiber).pipe(
              Effect.timeout(2000)
            );

            return broadcasts;
          })
        ).pipe(Effect.provide(makeTestLayer()))
      );

      expect(result).toBeDefined();
      if (result) {
        const broadcasts = Array.from(result);
        expect(broadcasts.length).toBe(1);
        expect(broadcasts[0]!.type).toBe("transaction");
      }
    });

    it("should broadcast to multiple subscribers", async () => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const manager = yield* DocumentManagerTag;

            const stream1 = yield* manager.subscribe("doc-1");
            const stream2 = yield* manager.subscribe("doc-1");

            const collectFiber1 = yield* Effect.fork(
              stream1.pipe(Stream.take(1), Stream.runCollect)
            );
            const collectFiber2 = yield* Effect.fork(
              stream2.pipe(Stream.take(1), Stream.runCollect)
            );

            yield* Effect.sleep(50);

            const tx = createValidTransaction("tx-multi", "Multi Broadcast");
            yield* manager.submit("doc-1", tx);

            const broadcasts1 = yield* Fiber.join(collectFiber1).pipe(
              Effect.timeout(2000)
            );
            const broadcasts2 = yield* Fiber.join(collectFiber2).pipe(
              Effect.timeout(2000)
            );

            return { broadcasts1, broadcasts2 };
          })
        ).pipe(Effect.provide(makeTestLayer()))
      );

      expect(result.broadcasts1).toBeDefined();
      expect(result.broadcasts2).toBeDefined();
      if (result.broadcasts1 && result.broadcasts2) {
        expect(Array.from(result.broadcasts1).length).toBe(1);
        expect(Array.from(result.broadcasts2).length).toBe(1);
      }
    });
  });

  describe("Tag", () => {
    it("should have correct identifier", () => {
      expect(DocumentManagerTag.key).toBe(
        "@voidhash/mimic-effect/DocumentManager"
      );
    });
  });
});
