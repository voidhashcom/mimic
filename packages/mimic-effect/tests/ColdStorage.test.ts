import { describe, it, expect } from "vitest";
import { Effect, Layer } from "effect";
import { ColdStorage, ColdStorageTag } from "../src/ColdStorage";
import type { StoredDocument } from "../src/Types";

describe("ColdStorage", () => {
  describe("InMemory", () => {
    const layer = ColdStorage.InMemory.make();

    it("should return undefined for missing document", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* ColdStorageTag;
          return yield* storage.load("non-existent");
        }).pipe(Effect.provide(layer))
      );

      expect(result).toBeUndefined();
    });

    it("should save and load document", async () => {
      const doc: StoredDocument = {
        state: { title: "Test", count: 42 },
        version: 5,
        schemaVersion: 1,
        savedAt: Date.now(),
      };

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* ColdStorageTag;
          yield* storage.save("doc-1", doc);
          return yield* storage.load("doc-1");
        }).pipe(Effect.provide(layer))
      );

      expect(result).toEqual(doc);
    });

    it("should update existing document", async () => {
      const doc1: StoredDocument = {
        state: { title: "First" },
        version: 1,
        schemaVersion: 1,
        savedAt: Date.now(),
      };

      const doc2: StoredDocument = {
        state: { title: "Second" },
        version: 2,
        schemaVersion: 1,
        savedAt: Date.now(),
      };

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* ColdStorageTag;
          yield* storage.save("doc-1", doc1);
          yield* storage.save("doc-1", doc2);
          return yield* storage.load("doc-1");
        }).pipe(Effect.provide(layer))
      );

      expect(result).toEqual(doc2);
    });

    it("should delete document", async () => {
      const doc: StoredDocument = {
        state: { title: "To Delete" },
        version: 1,
        schemaVersion: 1,
        savedAt: Date.now(),
      };

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* ColdStorageTag;
          yield* storage.save("doc-1", doc);
          yield* storage.delete("doc-1");
          return yield* storage.load("doc-1");
        }).pipe(Effect.provide(layer))
      );

      expect(result).toBeUndefined();
    });

    it("should handle multiple documents independently", async () => {
      const doc1: StoredDocument = {
        state: { title: "Doc 1" },
        version: 1,
        schemaVersion: 1,
        savedAt: Date.now(),
      };

      const doc2: StoredDocument = {
        state: { title: "Doc 2" },
        version: 2,
        schemaVersion: 1,
        savedAt: Date.now(),
      };

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* ColdStorageTag;
          yield* storage.save("doc-1", doc1);
          yield* storage.save("doc-2", doc2);

          const loaded1 = yield* storage.load("doc-1");
          const loaded2 = yield* storage.load("doc-2");

          return { loaded1, loaded2 };
        }).pipe(Effect.provide(layer))
      );

      expect(result.loaded1).toEqual(doc1);
      expect(result.loaded2).toEqual(doc2);
    });

    it("should not error when deleting non-existent document", async () => {
      await expect(
        Effect.runPromise(
          Effect.gen(function* () {
            const storage = yield* ColdStorageTag;
            yield* storage.delete("non-existent");
          }).pipe(Effect.provide(layer))
        )
      ).resolves.toBeUndefined();
    });
  });

  describe("Tag", () => {
    it("should have correct identifier", () => {
      expect(ColdStorageTag.key).toBe("@voidhash/mimic-effect/ColdStorage");
    });
  });
});
