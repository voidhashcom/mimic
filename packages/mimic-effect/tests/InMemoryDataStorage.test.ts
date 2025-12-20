import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import * as InMemoryDataStorage from "../src/storage/InMemoryDataStorage";
import { MimicDataStorageTag } from "../src/MimicDataStorage";

// =============================================================================
// InMemoryDataStorage Tests
// =============================================================================

describe("InMemoryDataStorage", () => {
  describe("load", () => {
    it("should return undefined for non-existent documents", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* MimicDataStorageTag;
          return yield* storage.load("non-existent-doc");
        }).pipe(Effect.provide(InMemoryDataStorage.layer))
      );

      expect(result).toBeUndefined();
    });
  });

  describe("save and load", () => {
    it("should save and load document state", async () => {
      const testState = { title: "Test Document", count: 42 };

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* MimicDataStorageTag;
          yield* storage.save("doc-1", testState);
          return yield* storage.load("doc-1");
        }).pipe(Effect.provide(InMemoryDataStorage.layer))
      );

      expect(result).toEqual(testState);
    });

    it("should update existing document", async () => {
      const initialState = { title: "Initial", count: 0 };
      const updatedState = { title: "Updated", count: 100 };

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* MimicDataStorageTag;
          yield* storage.save("doc-1", initialState);
          yield* storage.save("doc-1", updatedState);
          return yield* storage.load("doc-1");
        }).pipe(Effect.provide(InMemoryDataStorage.layer))
      );

      expect(result).toEqual(updatedState);
    });

    it("should store multiple documents independently", async () => {
      const state1 = { title: "Doc 1" };
      const state2 = { title: "Doc 2" };
      const state3 = { title: "Doc 3" };

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* MimicDataStorageTag;
          yield* storage.save("doc-1", state1);
          yield* storage.save("doc-2", state2);
          yield* storage.save("doc-3", state3);
          return {
            doc1: yield* storage.load("doc-1"),
            doc2: yield* storage.load("doc-2"),
            doc3: yield* storage.load("doc-3"),
          };
        }).pipe(Effect.provide(InMemoryDataStorage.layer))
      );

      expect(result.doc1).toEqual(state1);
      expect(result.doc2).toEqual(state2);
      expect(result.doc3).toEqual(state3);
    });
  });

  describe("delete", () => {
    it("should delete existing document", async () => {
      const testState = { title: "To be deleted" };

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* MimicDataStorageTag;
          yield* storage.save("doc-1", testState);
          const beforeDelete = yield* storage.load("doc-1");
          yield* storage.delete("doc-1");
          const afterDelete = yield* storage.load("doc-1");
          return { beforeDelete, afterDelete };
        }).pipe(Effect.provide(InMemoryDataStorage.layer))
      );

      expect(result.beforeDelete).toEqual(testState);
      expect(result.afterDelete).toBeUndefined();
    });

    it("should handle deleting non-existent document gracefully", async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* MimicDataStorageTag;
          yield* storage.delete("non-existent-doc");
        }).pipe(Effect.provide(InMemoryDataStorage.layer))
      );
      // Should not throw
    });

    it("should not affect other documents when deleting", async () => {
      const state1 = { title: "Doc 1" };
      const state2 = { title: "Doc 2" };

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* MimicDataStorageTag;
          yield* storage.save("doc-1", state1);
          yield* storage.save("doc-2", state2);
          yield* storage.delete("doc-1");
          return {
            doc1: yield* storage.load("doc-1"),
            doc2: yield* storage.load("doc-2"),
          };
        }).pipe(Effect.provide(InMemoryDataStorage.layer))
      );

      expect(result.doc1).toBeUndefined();
      expect(result.doc2).toEqual(state2);
    });
  });

  describe("onLoad", () => {
    it("should pass through state unchanged", async () => {
      const testState = { title: "Test", nested: { value: 123 } };

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* MimicDataStorageTag;
          return yield* storage.onLoad(testState);
        }).pipe(Effect.provide(InMemoryDataStorage.layer))
      );

      expect(result).toBe(testState);
    });
  });

  describe("onSave", () => {
    it("should pass through state unchanged", async () => {
      const testState = { title: "Test", nested: { value: 456 } };

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* MimicDataStorageTag;
          return yield* storage.onSave(testState);
        }).pipe(Effect.provide(InMemoryDataStorage.layer))
      );

      expect(result).toBe(testState);
    });
  });

  describe("layer aliases", () => {
    it("should have layerDefault as an alias for layer", () => {
      expect(InMemoryDataStorage.layerDefault).toBe(InMemoryDataStorage.layer);
    });
  });

  describe("isolation", () => {
    it("should have independent storage per layer instance", async () => {
      const testState = { title: "Isolated" };

      // Save in one layer
      await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* MimicDataStorageTag;
          yield* storage.save("doc-1", testState);
        }).pipe(Effect.provide(InMemoryDataStorage.layer))
      );

      // Load in a new layer instance - should not find the document
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* MimicDataStorageTag;
          return yield* storage.load("doc-1");
        }).pipe(Effect.provide(InMemoryDataStorage.layer))
      );

      expect(result).toBeUndefined();
    });
  });
});
