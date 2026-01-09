import { describe, it, expect } from "vitest";
import { Effect, Layer, Schema } from "effect";
import { Primitive, Presence, Document, Transaction } from "@voidhash/mimic";
import { TestRunner } from "@effect/cluster";
import {
  MimicClusterServerEngine,
} from "../src/MimicClusterServerEngine.js";
import { MimicServerEngineTag } from "../src/MimicServerEngine.js";
import { ColdStorage } from "../src/ColdStorage.js";
import { HotStorage } from "../src/HotStorage.js";
import { MimicAuthService } from "../src/MimicAuthService.js";

// =============================================================================
// Test Schema
// =============================================================================

const TestSchema = Primitive.Struct({
  title: Primitive.String().default(""),
  count: Primitive.Number().default(0),
});

const CursorPresence = Presence.make({
  schema: Schema.Struct({
    x: Schema.Number,
    y: Schema.Number,
    name: Schema.optional(Schema.String),
  }),
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a valid transaction using the Document API
 */
const createValidTransaction = (title: string): Transaction.Transaction => {
  const doc = Document.make(TestSchema);
  doc.transaction((root) => {
    root.title.set(title);
  });
  return doc.flush();
};

// =============================================================================
// Test Layer Factory
// =============================================================================

const makeTestLayer = (options?: {
  withPresence?: boolean;
  authPermissions?: Record<string, "read" | "write">;
  initial?: { title: string; count?: number };
  shardGroup?: string;
}) => {
  const Engine = MimicClusterServerEngine.make({
    schema: TestSchema,
    initial: options?.initial,
    presence: options?.withPresence ? CursorPresence : undefined,
    shardGroup: options?.shardGroup ?? "test-documents",
  });

  const authLayer = options?.authPermissions
    ? MimicAuthService.Static.make({
        permissions: options.authPermissions,
        defaultPermission: undefined,
      })
    : MimicAuthService.NoAuth.make();

  return Engine.pipe(
    Layer.provide(ColdStorage.InMemory.make()),
    Layer.provide(HotStorage.InMemory.make()),
    Layer.provide(authLayer),
    Layer.provide(TestRunner.layer)
  );
};

// =============================================================================
// MimicClusterServerEngine Tests
// =============================================================================

describe("MimicClusterServerEngine", () => {
  describe("make", () => {
    it("should create engine with minimal config", async () => {
      const Engine = MimicClusterServerEngine.make({
        schema: TestSchema,
      });

      const layer = Engine.pipe(
        Layer.provide(ColdStorage.InMemory.make()),
        Layer.provide(HotStorage.InMemory.make()),
        Layer.provide(MimicAuthService.NoAuth.make()),
        Layer.provide(TestRunner.layer)
      );

      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const engine = yield* MimicServerEngineTag;
            // Engine should have document management methods
            return (
              typeof engine.submit === "function" &&
              typeof engine.getSnapshot === "function" &&
              typeof engine.subscribe === "function" &&
              typeof engine.touch === "function" &&
              engine.config !== undefined
            );
          })
        ).pipe(Effect.provide(layer))
      );

      expect(result).toBe(true);
    });

    it("should create engine with full config", async () => {
      const Engine = MimicClusterServerEngine.make({
        schema: TestSchema,
        initial: { title: "Default Title" },
        maxIdleTime: "10 minutes",
        maxTransactionHistory: 500,
        snapshot: {
          interval: "1 minute",
          transactionThreshold: 50,
        },
        shardGroup: "custom-shard-group",
      });

      const layer = Engine.pipe(
        Layer.provide(ColdStorage.InMemory.make()),
        Layer.provide(HotStorage.InMemory.make()),
        Layer.provide(MimicAuthService.NoAuth.make()),
        Layer.provide(TestRunner.layer)
      );

      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const engine = yield* MimicServerEngineTag;
            return engine.config !== undefined;
          })
        ).pipe(Effect.provide(layer))
      );

      expect(result).toBe(true);
    });

    it("should work with static auth", async () => {
      const Engine = MimicClusterServerEngine.make({
        schema: TestSchema,
      });

      const layer = Engine.pipe(
        Layer.provide(ColdStorage.InMemory.make()),
        Layer.provide(HotStorage.InMemory.make()),
        Layer.provide(
          MimicAuthService.Static.make({
            permissions: { admin: "write", user: "read" },
          })
        ),
        Layer.provide(TestRunner.layer)
      );

      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const engine = yield* MimicServerEngineTag;
            return engine.config !== undefined;
          })
        ).pipe(Effect.provide(layer))
      );

      expect(result).toBe(true);
    });
  });

  describe("document management", () => {
    it("should get snapshot for new document", async () => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const engine = yield* MimicServerEngineTag;
            const snapshot = yield* engine.getSnapshot("cluster-doc-1");
            return snapshot;
          })
        ).pipe(Effect.provide(makeTestLayer({ initial: { title: "Initial" } })))
      );

      // Note: state only includes properties that were explicitly set (not defaults)
      expect(result.state).toEqual({ title: "Initial" });
      expect(result.version).toBe(0);
    });

    it("should submit transaction and update state", async () => {
      const tx = createValidTransaction("Updated Title");

      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const engine = yield* MimicServerEngineTag;

            // Submit transaction
            const submitResult = yield* engine.submit("cluster-doc-2", tx);

            // Get snapshot
            const snapshot = yield* engine.getSnapshot("cluster-doc-2");

            return { submitResult, snapshot };
          })
        ).pipe(Effect.provide(makeTestLayer({ initial: { title: "Initial" } })))
      );

      expect(result.submitResult.success).toBe(true);
      if (result.submitResult.success) {
        expect(result.submitResult.version).toBe(1);
      }
      // Note: state only includes properties that were explicitly set
      expect(result.snapshot.state).toEqual({ title: "Updated Title" });
    });

    it("should touch document without error", async () => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const engine = yield* MimicServerEngineTag;

            // Get document first (creates it)
            yield* engine.getSnapshot("cluster-doc-3");

            // Touch should not throw
            yield* engine.touch("cluster-doc-3");

            return true;
          })
        ).pipe(Effect.provide(makeTestLayer()))
      );

      expect(result).toBe(true);
    });

    it("should handle multiple sequential transactions", async () => {
      const tx1 = createValidTransaction("First");
      const tx2 = createValidTransaction("Second");
      const tx3 = createValidTransaction("Third");

      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const engine = yield* MimicServerEngineTag;

            const r1 = yield* engine.submit("cluster-doc-seq", tx1);
            const r2 = yield* engine.submit("cluster-doc-seq", tx2);
            const r3 = yield* engine.submit("cluster-doc-seq", tx3);

            const snapshot = yield* engine.getSnapshot("cluster-doc-seq");

            return { r1, r2, r3, snapshot };
          })
        ).pipe(Effect.provide(makeTestLayer({ initial: { title: "Initial" } })))
      );

      expect(result.r1.success).toBe(true);
      expect(result.r2.success).toBe(true);
      expect(result.r3.success).toBe(true);

      if (result.r1.success && result.r2.success && result.r3.success) {
        expect(result.r1.version).toBe(1);
        expect(result.r2.version).toBe(2);
        expect(result.r3.version).toBe(3);
      }

      expect(result.snapshot.version).toBe(3);
      expect(result.snapshot.state).toEqual({ title: "Third" });
    });

    it("should handle documents with different IDs independently", async () => {
      const tx1 = createValidTransaction("Doc A Title");
      const tx2 = createValidTransaction("Doc B Title");

      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const engine = yield* MimicServerEngineTag;

            yield* engine.submit("doc-a", tx1);
            yield* engine.submit("doc-b", tx2);

            const snapshotA = yield* engine.getSnapshot("doc-a");
            const snapshotB = yield* engine.getSnapshot("doc-b");

            return { snapshotA, snapshotB };
          })
        ).pipe(Effect.provide(makeTestLayer({ initial: { title: "Initial" } })))
      );

      expect(result.snapshotA.state).toEqual({ title: "Doc A Title" });
      expect(result.snapshotB.state).toEqual({ title: "Doc B Title" });
    });
  });

  describe("presence management", () => {
    it("should set and get presence", async () => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const engine = yield* MimicServerEngineTag;

            // Set presence
            yield* engine.setPresence("cluster-presence-1", "conn-1", {
              data: { x: 10, y: 20 },
              userId: "user-1",
            });

            // Get snapshot
            const snapshot = yield* engine.getPresenceSnapshot(
              "cluster-presence-1"
            );

            return snapshot;
          })
        ).pipe(Effect.provide(makeTestLayer({ withPresence: true })))
      );

      expect(result.presences["conn-1"]).toEqual({
        data: { x: 10, y: 20 },
        userId: "user-1",
      });
    });

    it("should remove presence", async () => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const engine = yield* MimicServerEngineTag;

            // Set presence
            yield* engine.setPresence("cluster-presence-2", "conn-2", {
              data: { x: 10, y: 20 },
              userId: "user-1",
            });

            // Remove presence
            yield* engine.removePresence("cluster-presence-2", "conn-2");

            // Get snapshot
            const snapshot = yield* engine.getPresenceSnapshot(
              "cluster-presence-2"
            );

            return snapshot;
          })
        ).pipe(Effect.provide(makeTestLayer({ withPresence: true })))
      );

      expect(result.presences["conn-2"]).toBeUndefined();
    });

    it("should handle multiple presence entries", async () => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const engine = yield* MimicServerEngineTag;

            yield* engine.setPresence("cluster-presence-multi", "conn-a", {
              data: { x: 0, y: 0 },
              userId: "user-a",
            });

            yield* engine.setPresence("cluster-presence-multi", "conn-b", {
              data: { x: 100, y: 100 },
              userId: "user-b",
            });

            yield* engine.setPresence("cluster-presence-multi", "conn-c", {
              data: { x: 50, y: 50 },
              userId: "user-c",
            });

            const snapshot = yield* engine.getPresenceSnapshot(
              "cluster-presence-multi"
            );

            return snapshot;
          })
        ).pipe(Effect.provide(makeTestLayer({ withPresence: true })))
      );

      expect(Object.keys(result.presences)).toHaveLength(3);
      expect(result.presences["conn-a"]).toEqual({
        data: { x: 0, y: 0 },
        userId: "user-a",
      });
      expect(result.presences["conn-b"]).toEqual({
        data: { x: 100, y: 100 },
        userId: "user-b",
      });
      expect(result.presences["conn-c"]).toEqual({
        data: { x: 50, y: 50 },
        userId: "user-c",
      });
    });

    it("should update existing presence entry", async () => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const engine = yield* MimicServerEngineTag;

            // Set initial presence
            yield* engine.setPresence("cluster-presence-update", "conn-1", {
              data: { x: 10, y: 20 },
              userId: "user-1",
            });

            // Update presence
            yield* engine.setPresence("cluster-presence-update", "conn-1", {
              data: { x: 100, y: 200 },
              userId: "user-1",
            });

            const snapshot = yield* engine.getPresenceSnapshot(
              "cluster-presence-update"
            );

            return snapshot;
          })
        ).pipe(Effect.provide(makeTestLayer({ withPresence: true })))
      );

      expect(result.presences["conn-1"]).toEqual({
        data: { x: 100, y: 200 },
        userId: "user-1",
      });
    });
  });

  describe("config resolution", () => {
    it("should use default shardGroup when not specified", async () => {
      const Engine = MimicClusterServerEngine.make({
        schema: TestSchema,
      });

      const layer = Engine.pipe(
        Layer.provide(ColdStorage.InMemory.make()),
        Layer.provide(HotStorage.InMemory.make()),
        Layer.provide(MimicAuthService.NoAuth.make()),
        Layer.provide(TestRunner.layer)
      );

      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const engine = yield* MimicServerEngineTag;
            // Config should have shardGroup
            return (engine.config as { shardGroup?: string }).shardGroup;
          })
        ).pipe(Effect.provide(layer))
      );

      expect(result).toBe("mimic-documents");
    });

    it("should use custom shardGroup when specified", async () => {
      const Engine = MimicClusterServerEngine.make({
        schema: TestSchema,
        shardGroup: "custom-documents",
      });

      const layer = Engine.pipe(
        Layer.provide(ColdStorage.InMemory.make()),
        Layer.provide(HotStorage.InMemory.make()),
        Layer.provide(MimicAuthService.NoAuth.make()),
        Layer.provide(TestRunner.layer)
      );

      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const engine = yield* MimicServerEngineTag;
            return (engine.config as { shardGroup?: string }).shardGroup;
          })
        ).pipe(Effect.provide(layer))
      );

      expect(result).toBe("custom-documents");
    });

    it("should create engine with presence enabled", async () => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const engine = yield* MimicServerEngineTag;
            return engine.config.presence !== undefined;
          })
        ).pipe(Effect.provide(makeTestLayer({ withPresence: true })))
      );

      expect(result).toBe(true);
    });

    it("should create engine with initial state function", async () => {
      const Engine = MimicClusterServerEngine.make({
        schema: TestSchema,
        initial: (ctx) =>
          Effect.succeed({
            title: `Document: ${ctx.documentId}`,
          }),
      });

      const layer = Engine.pipe(
        Layer.provide(ColdStorage.InMemory.make()),
        Layer.provide(HotStorage.InMemory.make()),
        Layer.provide(MimicAuthService.NoAuth.make()),
        Layer.provide(TestRunner.layer)
      );

      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const engine = yield* MimicServerEngineTag;
            const snapshot = yield* engine.getSnapshot("my-special-doc");
            return snapshot;
          })
        ).pipe(Effect.provide(layer))
      );

      expect(result.state).toEqual({ title: "Document: my-special-doc" });
    });
  });

  describe("subscription", () => {
    it("should provide subscribe method that returns stream", async () => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const engine = yield* MimicServerEngineTag;
            const stream = yield* engine.subscribe("cluster-sub-doc");
            // Verify we get a stream (has pipe method)
            return typeof stream.pipe === "function";
          })
        ).pipe(Effect.provide(makeTestLayer()))
      );

      expect(result).toBe(true);
    });

    it("should provide subscribePresence method that returns stream", async () => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const engine = yield* MimicServerEngineTag;
            const stream = yield* engine.subscribePresence(
              "cluster-sub-presence"
            );
            // Verify we get a stream (has pipe method)
            return typeof stream.pipe === "function";
          })
        ).pipe(Effect.provide(makeTestLayer({ withPresence: true })))
      );

      expect(result).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should handle duplicate transaction gracefully", async () => {
      const tx = createValidTransaction("Test");

      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const engine = yield* MimicServerEngineTag;

            // Submit first time - should succeed
            const first = yield* engine.submit("cluster-dup-doc", tx);

            // Submit same transaction again - should fail
            const second = yield* engine.submit("cluster-dup-doc", tx);

            return { first, second };
          })
        ).pipe(Effect.provide(makeTestLayer({ initial: { title: "Initial" } })))
      );

      expect(result.first.success).toBe(true);
      expect(result.second.success).toBe(false);
    });
  });
});
