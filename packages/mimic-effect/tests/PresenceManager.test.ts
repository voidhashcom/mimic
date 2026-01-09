import { describe, it, expect } from "vitest";
import { Effect, Stream, Chunk, Fiber } from "effect";
import { PresenceManager, PresenceManagerTag } from "../src/PresenceManager.js";

describe("PresenceManager", () => {
  describe("getSnapshot", () => {
    it("should return empty snapshot for unknown document", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const pm = yield* PresenceManagerTag;
          return yield* pm.getSnapshot("unknown-doc");
        }).pipe(Effect.provide(PresenceManager.layer))
      );

      expect(result.presences).toEqual({});
    });

    it("should return presences after set", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const pm = yield* PresenceManagerTag;

          yield* pm.set("doc-1", "conn-1", {
            data: { x: 10, y: 20 },
            userId: "user-1",
          });

          return yield* pm.getSnapshot("doc-1");
        }).pipe(Effect.provide(PresenceManager.layer))
      );

      expect(result.presences).toEqual({
        "conn-1": { data: { x: 10, y: 20 }, userId: "user-1" },
      });
    });

    it("should return multiple presences", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const pm = yield* PresenceManagerTag;

          yield* pm.set("doc-1", "conn-1", { data: { x: 10, y: 20 } });
          yield* pm.set("doc-1", "conn-2", {
            data: { x: 30, y: 40 },
            userId: "user-2",
          });
          yield* pm.set("doc-1", "conn-3", { data: { x: 50, y: 60 } });

          return yield* pm.getSnapshot("doc-1");
        }).pipe(Effect.provide(PresenceManager.layer))
      );

      expect(Object.keys(result.presences).length).toBe(3);
      expect(result.presences["conn-1"]).toEqual({ data: { x: 10, y: 20 } });
      expect(result.presences["conn-2"]).toEqual({
        data: { x: 30, y: 40 },
        userId: "user-2",
      });
      expect(result.presences["conn-3"]).toEqual({ data: { x: 50, y: 60 } });
    });
  });

  describe("set", () => {
    it("should store presence entry", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const pm = yield* PresenceManagerTag;

          yield* pm.set("doc-1", "conn-1", {
            data: { cursor: { x: 100, y: 200 } },
          });

          return yield* pm.getSnapshot("doc-1");
        }).pipe(Effect.provide(PresenceManager.layer))
      );

      expect(result.presences["conn-1"]).toEqual({
        data: { cursor: { x: 100, y: 200 } },
      });
    });

    it("should update existing presence entry", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const pm = yield* PresenceManagerTag;

          yield* pm.set("doc-1", "conn-1", { data: { x: 10, y: 20 } });
          yield* pm.set("doc-1", "conn-1", { data: { x: 100, y: 200 } });

          return yield* pm.getSnapshot("doc-1");
        }).pipe(Effect.provide(PresenceManager.layer))
      );

      expect(result.presences["conn-1"]).toEqual({ data: { x: 100, y: 200 } });
    });

    it("should broadcast presence_update event", async () => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const pm = yield* PresenceManagerTag;

            // Subscribe first
            const eventStream = yield* pm.subscribe("doc-1");

            // Collect events in background
            const eventsFiber = yield* Effect.fork(
              Stream.runCollect(Stream.take(eventStream, 1))
            );

            // Small delay to ensure subscription is ready
            yield* Effect.sleep("10 millis");

            // Set presence
            yield* pm.set("doc-1", "conn-1", {
              data: { x: 10, y: 20 },
              userId: "user-1",
            });

            // Wait for events
            const events = yield* Fiber.join(eventsFiber);

            return Chunk.toArray(events);
          })
        ).pipe(Effect.provide(PresenceManager.layer))
      );

      expect(result.length).toBe(1);
      expect(result[0]!.type).toBe("presence_update");
      if (result[0]!.type === "presence_update") {
        expect(result[0]!.id).toBe("conn-1");
        expect(result[0]!.data).toEqual({ x: 10, y: 20 });
        expect(result[0]!.userId).toBe("user-1");
      }
    });
  });

  describe("remove", () => {
    it("should remove presence entry", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const pm = yield* PresenceManagerTag;

          yield* pm.set("doc-1", "conn-1", { data: { x: 10, y: 20 } });
          yield* pm.remove("doc-1", "conn-1");

          return yield* pm.getSnapshot("doc-1");
        }).pipe(Effect.provide(PresenceManager.layer))
      );

      expect(result.presences).toEqual({});
    });

    it("should not error when removing non-existent connection", async () => {
      await expect(
        Effect.runPromise(
          Effect.gen(function* () {
            const pm = yield* PresenceManagerTag;
            yield* pm.remove("doc-1", "non-existent-conn");
          }).pipe(Effect.provide(PresenceManager.layer))
        )
      ).resolves.toBeUndefined();
    });

    it("should not error when removing from non-existent document", async () => {
      await expect(
        Effect.runPromise(
          Effect.gen(function* () {
            const pm = yield* PresenceManagerTag;
            yield* pm.remove("non-existent-doc", "conn-1");
          }).pipe(Effect.provide(PresenceManager.layer))
        )
      ).resolves.toBeUndefined();
    });

    it("should broadcast presence_remove event", async () => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const pm = yield* PresenceManagerTag;

            // Set presence first
            yield* pm.set("doc-1", "conn-1", { data: { x: 10, y: 20 } });

            // Subscribe
            const eventStream = yield* pm.subscribe("doc-1");

            // Collect events in background
            const eventsFiber = yield* Effect.fork(
              Stream.runCollect(Stream.take(eventStream, 1))
            );

            // Small delay to ensure subscription is ready
            yield* Effect.sleep("10 millis");

            // Remove presence
            yield* pm.remove("doc-1", "conn-1");

            // Wait for events
            const events = yield* Fiber.join(eventsFiber);

            return Chunk.toArray(events);
          })
        ).pipe(Effect.provide(PresenceManager.layer))
      );

      expect(result.length).toBe(1);
      expect(result[0]!.type).toBe("presence_remove");
      if (result[0]!.type === "presence_remove") {
        expect(result[0]!.id).toBe("conn-1");
      }
    });

    it("should not broadcast event when removing non-existent presence", async () => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const pm = yield* PresenceManagerTag;

            // Subscribe to doc that has no presences
            const eventStream = yield* pm.subscribe("doc-1");

            // Collect events in background with a timeout
            const eventsFiber = yield* Effect.fork(
              Stream.runCollect(
                Stream.take(eventStream, 1).pipe(Stream.timeout("50 millis"))
              )
            );

            // Small delay to ensure subscription is ready
            yield* Effect.sleep("10 millis");

            // Remove non-existent presence
            yield* pm.remove("doc-1", "non-existent-conn");

            // Wait for events (should timeout with no events)
            const events = yield* Fiber.join(eventsFiber);

            return Chunk.toArray(events);
          })
        ).pipe(Effect.provide(PresenceManager.layer))
      );

      expect(result.length).toBe(0);
    });
  });

  describe("subscribe", () => {
    it("should receive update events from stream", async () => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const pm = yield* PresenceManagerTag;

            const eventStream = yield* pm.subscribe("doc-1");

            const eventsFiber = yield* Effect.fork(
              Stream.runCollect(Stream.take(eventStream, 2))
            );

            yield* Effect.sleep("10 millis");

            yield* pm.set("doc-1", "conn-1", { data: { x: 10 } });
            yield* pm.set("doc-1", "conn-2", { data: { x: 20 } });

            const events = yield* Fiber.join(eventsFiber);
            return Chunk.toArray(events);
          })
        ).pipe(Effect.provide(PresenceManager.layer))
      );

      expect(result.length).toBe(2);
      expect(result[0]!.type).toBe("presence_update");
      expect(result[1]!.type).toBe("presence_update");
    });

    it("should receive mixed update and remove events", async () => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const pm = yield* PresenceManagerTag;

            // Set up initial presence
            yield* pm.set("doc-1", "conn-1", { data: { x: 10 } });

            const eventStream = yield* pm.subscribe("doc-1");

            const eventsFiber = yield* Effect.fork(
              Stream.runCollect(Stream.take(eventStream, 3))
            );

            yield* Effect.sleep("10 millis");

            yield* pm.set("doc-1", "conn-2", { data: { x: 20 } });
            yield* pm.remove("doc-1", "conn-1");
            yield* pm.set("doc-1", "conn-3", { data: { x: 30 } });

            const events = yield* Fiber.join(eventsFiber);
            return Chunk.toArray(events);
          })
        ).pipe(Effect.provide(PresenceManager.layer))
      );

      expect(result.length).toBe(3);
      expect(result[0]!.type).toBe("presence_update");
      expect(result[1]!.type).toBe("presence_remove");
      expect(result[2]!.type).toBe("presence_update");
    });
  });

  describe("document isolation", () => {
    it("should isolate presences between documents", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const pm = yield* PresenceManagerTag;

          yield* pm.set("doc-1", "conn-1", { data: { x: 10 } });
          yield* pm.set("doc-2", "conn-2", { data: { x: 20 } });

          const snapshot1 = yield* pm.getSnapshot("doc-1");
          const snapshot2 = yield* pm.getSnapshot("doc-2");

          return { snapshot1, snapshot2 };
        }).pipe(Effect.provide(PresenceManager.layer))
      );

      expect(Object.keys(result.snapshot1.presences).length).toBe(1);
      expect(result.snapshot1.presences["conn-1"]).toEqual({ data: { x: 10 } });
      expect(result.snapshot1.presences["conn-2"]).toBeUndefined();

      expect(Object.keys(result.snapshot2.presences).length).toBe(1);
      expect(result.snapshot2.presences["conn-2"]).toEqual({ data: { x: 20 } });
      expect(result.snapshot2.presences["conn-1"]).toBeUndefined();
    });

    it("should isolate events between documents", async () => {
      const result = await Effect.runPromise(
        Effect.scoped(
          Effect.gen(function* () {
            const pm = yield* PresenceManagerTag;

            // Subscribe to doc-1 only
            const eventStream = yield* pm.subscribe("doc-1");

            const eventsFiber = yield* Effect.fork(
              Stream.runCollect(
                Stream.take(eventStream, 1).pipe(Stream.timeout("100 millis"))
              )
            );

            yield* Effect.sleep("10 millis");

            // Set presence on doc-2 (should NOT trigger doc-1 event)
            yield* pm.set("doc-2", "conn-1", { data: { x: 10 } });

            // Set presence on doc-1 (should trigger event)
            yield* pm.set("doc-1", "conn-2", { data: { x: 20 } });

            const events = yield* Fiber.join(eventsFiber);
            return Chunk.toArray(events);
          })
        ).pipe(Effect.provide(PresenceManager.layer))
      );

      expect(result.length).toBe(1);
      if (result[0]!.type === "presence_update") {
        expect(result[0]!.id).toBe("conn-2");
        expect(result[0]!.data).toEqual({ x: 20 });
      }
    });
  });

  describe("Tag", () => {
    it("should have correct identifier", () => {
      expect(PresenceManagerTag.key).toBe(
        "@voidhash/mimic-effect/PresenceManager"
      );
    });
  });
});
