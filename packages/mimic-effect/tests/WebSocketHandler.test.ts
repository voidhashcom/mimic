import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as Chunk from "effect/Chunk";
import * as Fiber from "effect/Fiber";
import * as Schema from "effect/Schema";
import { Primitive, Presence } from "@voidhash/mimic";
import * as WebSocketHandler from "../src/WebSocketHandler";
import * as MimicConfig from "../src/MimicConfig";
import * as MimicAuthService from "../src/MimicAuthService";
import * as DocumentManager from "../src/DocumentManager";
import * as PresenceManager from "../src/PresenceManager";
import * as InMemoryDataStorage from "../src/storage/InMemoryDataStorage";
import { MissingDocumentIdError } from "../src/errors";

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
// Test Layer Factory
// =============================================================================

const makeTestLayer = (options?: { withPresence?: boolean }) => {
  const configLayer = MimicConfig.layer({
    schema: TestSchema,
    presence: options?.withPresence ? CursorPresence : undefined,
  });

  const authLayer = MimicAuthService.layer({
    authHandler: (token) => ({ success: true, userId: token || "anonymous" }),
  });

  return Layer.mergeAll(
    configLayer,
    authLayer,
    DocumentManager.layer.pipe(
      Layer.provide(configLayer),
      Layer.provide(InMemoryDataStorage.layer)
    ),
    PresenceManager.layer
  );
};

// =============================================================================
// extractDocumentId Tests
// =============================================================================

describe("WebSocketHandler", () => {
  describe("extractDocumentId", () => {
    it("should extract document ID from /doc/{id} path", () => {
      const result = Effect.runSync(
        WebSocketHandler.extractDocumentId("/doc/my-document-id")
      );
      expect(result).toBe("my-document-id");
    });

    it("should extract document ID from /doc/{id} with leading slashes", () => {
      const result = Effect.runSync(
        WebSocketHandler.extractDocumentId("///doc/my-document-id")
      );
      expect(result).toBe("my-document-id");
    });

    it("should extract document ID from nested paths like /mimic/todo/doc/{id}", () => {
      const result = Effect.runSync(
        WebSocketHandler.extractDocumentId("/mimic/todo/doc/my-document-id")
      );
      expect(result).toBe("my-document-id");
    });

    it("should handle URL-encoded document IDs", () => {
      const result = Effect.runSync(
        WebSocketHandler.extractDocumentId("/doc/my%20document%3Aid")
      );
      expect(result).toBe("my document:id");
    });

    it("should handle document IDs with colons (type:id format)", () => {
      const result = Effect.runSync(
        WebSocketHandler.extractDocumentId("/doc/todo:abc-123")
      );
      expect(result).toBe("todo:abc-123");
    });

    it("should fail for empty path", () => {
      const result = Effect.runSyncExit(
        WebSocketHandler.extractDocumentId("/")
      );
      expect(result._tag).toBe("Failure");
    });

    it("should fail for /doc without document ID", () => {
      const result = Effect.runSyncExit(
        WebSocketHandler.extractDocumentId("/doc")
      );
      expect(result._tag).toBe("Failure");
    });

    it("should fail for /doc/ without document ID", () => {
      const result = Effect.runSyncExit(
        WebSocketHandler.extractDocumentId("/doc/")
      );
      // This will fail because after split, parts[1] will be empty string
      expect(result._tag).toBe("Failure");
    });
  });

  describe("makeHandler", () => {
    it("should create a handler function", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const handler = yield* WebSocketHandler.makeHandler;
          return typeof handler === "function";
        }).pipe(Effect.provide(makeTestLayer()))
      );

      expect(result).toBe(true);
    });

    it("should create a handler with presence enabled", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const handler = yield* WebSocketHandler.makeHandler;
          return typeof handler === "function";
        }).pipe(Effect.provide(makeTestLayer({ withPresence: true })))
      );

      expect(result).toBe(true);
    });
  });

  describe("presence integration with PresenceManager", () => {
    it("should store presence data through PresenceManager", async () => {
      // This tests that the PresenceManager is properly integrated
      // with the WebSocketHandler layer composition
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const pm = yield* PresenceManager.PresenceManagerTag;

          // Simulate what the WebSocketHandler would do when receiving presence_set
          yield* pm.set("doc-1", "conn-1", {
            data: { x: 100, y: 200 },
            userId: "user-1",
          });

          const snapshot = yield* pm.getSnapshot("doc-1");
          return snapshot;
        }).pipe(Effect.provide(makeTestLayer({ withPresence: true })))
      );

      expect(result.presences["conn-1"]).toEqual({
        data: { x: 100, y: 200 },
        userId: "user-1",
      });
    });

    it("should remove presence data through PresenceManager", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const pm = yield* PresenceManager.PresenceManagerTag;

          // Set presence
          yield* pm.set("doc-1", "conn-1", {
            data: { x: 100, y: 200 },
          });

          // Simulate disconnect - remove presence
          yield* pm.remove("doc-1", "conn-1");

          const snapshot = yield* pm.getSnapshot("doc-1");
          return snapshot;
        }).pipe(Effect.provide(makeTestLayer({ withPresence: true })))
      );

      expect(result.presences).toEqual({});
    });

    it("should broadcast presence events to subscribers", async () => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const pm = yield* PresenceManager.PresenceManagerTag;

            // Subscribe to presence events
            const eventStream = yield* pm.subscribe("doc-1");

            // Collect events in background
            const eventsFiber = yield* Effect.fork(
              Stream.runCollect(Stream.take(eventStream, 2))
            );

            yield* Effect.sleep("10 millis");

            // Simulate presence set and remove
            yield* pm.set("doc-1", "conn-1", { data: { x: 10, y: 20 } });
            yield* pm.remove("doc-1", "conn-1");

            const events = yield* Fiber.join(eventsFiber);
            return Chunk.toArray(events);
          })
        ).pipe(Effect.provide(makeTestLayer({ withPresence: true })))
      );

      expect(result.length).toBe(2);
      expect(result[0]!.type).toBe("presence_update");
      expect(result[1]!.type).toBe("presence_remove");
    });
  });

  describe("presence validation", () => {
    it("should validate presence data against schema using Presence module", () => {
      // This tests the validation logic that WebSocketHandler uses
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

  describe("presence message types", () => {
    // These tests document the expected presence message types
    // that the WebSocketHandler should handle

    it("should define presence_set client message format", () => {
      const message = {
        type: "presence_set" as const,
        data: { x: 100, y: 200 },
      };

      expect(message.type).toBe("presence_set");
      expect(message.data).toEqual({ x: 100, y: 200 });
    });

    it("should define presence_clear client message format", () => {
      const message = {
        type: "presence_clear" as const,
      };

      expect(message.type).toBe("presence_clear");
    });

    it("should define presence_snapshot server message format", () => {
      const message = {
        type: "presence_snapshot" as const,
        selfId: "conn-123",
        presences: {
          "conn-456": { data: { x: 10, y: 20 }, userId: "user-1" },
        },
      };

      expect(message.type).toBe("presence_snapshot");
      expect(message.selfId).toBe("conn-123");
      expect(message.presences["conn-456"]).toEqual({
        data: { x: 10, y: 20 },
        userId: "user-1",
      });
    });

    it("should define presence_update server message format", () => {
      const message = {
        type: "presence_update" as const,
        id: "conn-789",
        data: { x: 50, y: 75 },
        userId: "user-2",
      };

      expect(message.type).toBe("presence_update");
      expect(message.id).toBe("conn-789");
      expect(message.data).toEqual({ x: 50, y: 75 });
      expect(message.userId).toBe("user-2");
    });

    it("should define presence_remove server message format", () => {
      const message = {
        type: "presence_remove" as const,
        id: "conn-disconnected",
      };

      expect(message.type).toBe("presence_remove");
      expect(message.id).toBe("conn-disconnected");
    });
  });
});
