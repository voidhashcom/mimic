import { describe, it, expect } from "vitest";
import { Effect, Layer, Stream } from "effect";
import { Schema } from "effect";
import { Primitive, Presence, Document, Transaction } from "@voidhash/mimic";
import {
  MimicServerEngine,
  MimicServerEngineTag,
} from "../src/MimicServerEngine";
import { ColdStorage } from "../src/ColdStorage";
import { HotStorage } from "../src/HotStorage";
import { MimicAuthService } from "../src/MimicAuthService";
import * as Protocol from "../src/Protocol";

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
}) => {
  const Engine = MimicServerEngine.make({
    schema: TestSchema,
    initial: options?.initial,
    presence: options?.withPresence ? CursorPresence : undefined,
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
    Layer.provide(authLayer)
  );
};

// =============================================================================
// MimicServerEngine Tests
// =============================================================================

describe("MimicServerEngine", () => {
  describe("make", () => {
    it("should create engine with minimal config", async () => {
      const Engine = MimicServerEngine.make({
        schema: TestSchema,
      });

      const layer = Engine.pipe(
        Layer.provide(ColdStorage.InMemory.make()),
        Layer.provide(HotStorage.InMemory.make()),
        Layer.provide(MimicAuthService.NoAuth.make())
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
      const Engine = MimicServerEngine.make({
        schema: TestSchema,
        initial: { title: "Default Title" },
        maxIdleTime: "10 minutes",
        maxTransactionHistory: 500,
        snapshot: {
          interval: "1 minute",
          transactionThreshold: 50,
        },
      });

      const layer = Engine.pipe(
        Layer.provide(ColdStorage.InMemory.make()),
        Layer.provide(HotStorage.InMemory.make()),
        Layer.provide(MimicAuthService.NoAuth.make())
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
      const Engine = MimicServerEngine.make({
        schema: TestSchema,
      });

      const layer = Engine.pipe(
        Layer.provide(ColdStorage.InMemory.make()),
        Layer.provide(HotStorage.InMemory.make()),
        Layer.provide(
          MimicAuthService.Static.make({
            permissions: { admin: "write", user: "read" },
          })
        )
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
            const snapshot = yield* engine.getSnapshot("test-doc-1");
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
            const submitResult = yield* engine.submit("test-doc-2", tx);

            // Get snapshot
            const snapshot = yield* engine.getSnapshot("test-doc-2");

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

    it("should get tree snapshot for rendering", async () => {
      const tx = createValidTransaction("Tree Snapshot Test");

      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const engine = yield* MimicServerEngineTag;

            // Submit transaction
            yield* engine.submit("test-doc-tree", tx);

            // Get tree snapshot (for rendering)
            const treeSnapshot = yield* engine.getTreeSnapshot("test-doc-tree");

            return treeSnapshot;
          })
        ).pipe(Effect.provide(makeTestLayer({ initial: { title: "Initial" } })))
      );

      // Tree snapshot should have the expected structure with defaults resolved
      expect(result).toEqual({
        title: "Tree Snapshot Test",
        count: 0, // Default value
      });
    });

    it("should touch document to update activity time", async () => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const engine = yield* MimicServerEngineTag;
            
            // Get document first (creates it)
            yield* engine.getSnapshot("test-doc-3");
            
            // Touch should not throw
            yield* engine.touch("test-doc-3");
            
            return true;
          })
        ).pipe(Effect.provide(makeTestLayer()))
      );

      expect(result).toBe(true);
    });
  });

  describe("presence management", () => {
    it("should set and get presence", async () => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const engine = yield* MimicServerEngineTag;
            
            // Set presence
            yield* engine.setPresence("doc-1", "conn-1", {
              data: { x: 10, y: 20 },
              userId: "user-1",
            });
            
            // Get snapshot
            const snapshot = yield* engine.getPresenceSnapshot("doc-1");
            
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
            yield* engine.setPresence("doc-2", "conn-2", {
              data: { x: 10, y: 20 },
              userId: "user-1",
            });
            
            // Remove presence
            yield* engine.removePresence("doc-2", "conn-2");
            
            // Get snapshot
            const snapshot = yield* engine.getPresenceSnapshot("doc-2");
            
            return snapshot;
          })
        ).pipe(Effect.provide(makeTestLayer({ withPresence: true })))
      );

      expect(result.presences["conn-2"]).toBeUndefined();
    });
  });

  describe("Tag", () => {
    it("should have correct identifier", () => {
      expect(MimicServerEngineTag.key).toBe(
        "@voidhash/mimic-effect/MimicServerEngine"
      );
    });
  });

  describe("presence validation", () => {
    it("should validate presence data against schema using Presence module", () => {
      const validData = { x: 100, y: 200 };
      const invalidData = { x: "invalid", y: 200 };

      // Valid data should pass validation
      const validated = Presence.validateSafe(CursorPresence, validData);
      expect(validated).toEqual({ x: 100, y: 200 });

      // Invalid data should return undefined
      const invalidResult = Presence.validateSafe(CursorPresence, invalidData);
      expect(invalidResult).toBeUndefined();
    });

    it("should handle optional fields in presence schema", () => {
      // Without optional field
      const withoutName = Presence.validateSafe(CursorPresence, {
        x: 10,
        y: 20,
      });
      expect(withoutName).toEqual({ x: 10, y: 20 });

      // With optional field
      const withName = Presence.validateSafe(CursorPresence, {
        x: 10,
        y: 20,
        name: "Alice",
      });
      expect(withName).toEqual({ x: 10, y: 20, name: "Alice" });
    });
  });

  describe("protocol message types", () => {
    it("should create auth_result success message", () => {
      const message = Protocol.authResultSuccess("user-123", "write");
      expect(message).toEqual({
        type: "auth_result",
        success: true,
        userId: "user-123",
        permission: "write",
      });
    });

    it("should create auth_result failure message", () => {
      const message = Protocol.authResultFailure("Invalid token");
      expect(message).toEqual({
        type: "auth_result",
        success: false,
        error: "Invalid token",
      });
    });

    it("should create presence_snapshot message", () => {
      const message = Protocol.presenceSnapshotMessage("conn-123", {
        "conn-456": { data: { x: 10, y: 20 }, userId: "user-1" },
      });
      expect(message).toEqual({
        type: "presence_snapshot",
        selfId: "conn-123",
        presences: {
          "conn-456": { data: { x: 10, y: 20 }, userId: "user-1" },
        },
      });
    });

    it("should create presence_update message", () => {
      const message = Protocol.presenceUpdateMessage("conn-789", { x: 50, y: 75 }, "user-2");
      expect(message).toEqual({
        type: "presence_update",
        id: "conn-789",
        data: { x: 50, y: 75 },
        userId: "user-2",
      });
    });

    it("should create presence_remove message", () => {
      const message = Protocol.presenceRemoveMessage("conn-disconnected");
      expect(message).toEqual({
        type: "presence_remove",
        id: "conn-disconnected",
      });
    });

    it("should create pong message", () => {
      const message = Protocol.pong();
      expect(message).toEqual({ type: "pong" });
    });

    it("should create snapshot message", () => {
      const message = Protocol.snapshotMessage({ title: "Test", count: 5 }, 42);
      expect(message).toEqual({
        type: "snapshot",
        state: { title: "Test", count: 5 },
        version: 42,
      });
    });

    it("should create error message", () => {
      const message = Protocol.errorMessage("tx-123", "Duplicate transaction");
      expect(message).toEqual({
        type: "error",
        transactionId: "tx-123",
        reason: "Duplicate transaction",
      });
    });

    it("should create transaction message", () => {
      const tx = createValidTransaction("Test");
      const message = Protocol.transactionMessage(tx, 5);
      expect(message.type).toBe("transaction");
      expect(message.version).toBe(5);
      expect(message.transaction.id).toBe(tx.id);
    });
  });

  describe("protocol encoding/decoding", () => {
    it("should parse auth message", async () => {
      const result = await Effect.runPromise(
        Protocol.parseClientMessage(JSON.stringify({ type: "auth", token: "test-token" }))
      );
      expect(result).toEqual({ type: "auth", token: "test-token" });
    });

    it("should parse ping message", async () => {
      const result = await Effect.runPromise(
        Protocol.parseClientMessage(JSON.stringify({ type: "ping" }))
      );
      expect(result).toEqual({ type: "ping" });
    });

    it("should parse request_snapshot message", async () => {
      const result = await Effect.runPromise(
        Protocol.parseClientMessage(JSON.stringify({ type: "request_snapshot" }))
      );
      expect(result).toEqual({ type: "request_snapshot" });
    });

    it("should parse presence_set message", async () => {
      const result = await Effect.runPromise(
        Protocol.parseClientMessage(
          JSON.stringify({ type: "presence_set", data: { x: 10, y: 20 } })
        )
      );
      expect(result).toEqual({ type: "presence_set", data: { x: 10, y: 20 } });
    });

    it("should parse presence_clear message", async () => {
      const result = await Effect.runPromise(
        Protocol.parseClientMessage(JSON.stringify({ type: "presence_clear" }))
      );
      expect(result).toEqual({ type: "presence_clear" });
    });

    it("should encode and decode transaction message correctly", () => {
      const tx = createValidTransaction("Hello");
      const message = Protocol.transactionMessage(tx, 10);
      const encoded = Protocol.encodeServerMessage(message);
      const decoded = JSON.parse(encoded);
      
      expect(decoded.type).toBe("transaction");
      expect(decoded.version).toBe(10);
      // Transaction should be encoded
      expect(decoded.transaction).toBeDefined();
    });

    it("should encode snapshot message as JSON", () => {
      const message = Protocol.snapshotMessage({ title: "Test" }, 5);
      const encoded = Protocol.encodeServerMessage(message);
      const decoded = JSON.parse(encoded);
      
      expect(decoded).toEqual({
        type: "snapshot",
        state: { title: "Test" },
        version: 5,
      });
    });
  });

  describe("auth integration", () => {
    it("should authenticate with static auth service", async () => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const engine = yield* MimicServerEngineTag;
            // Just verify the engine was created with auth layer
            return engine.config !== undefined;
          })
        ).pipe(
          Effect.provide(
            makeTestLayer({
              authPermissions: { admin: "write", viewer: "read" },
            })
          )
        )
      );

      expect(result).toBe(true);
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

    it("should create engine with initial state", async () => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const engine = yield* MimicServerEngineTag;
            return engine.config.initial !== undefined;
          })
        ).pipe(Effect.provide(makeTestLayer({ initial: { title: "Initial" } })))
      );

      expect(result).toBe(true);
    });
  });
});
