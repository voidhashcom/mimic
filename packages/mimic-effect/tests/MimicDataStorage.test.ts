import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import * as MimicDataStorage from "../src/MimicDataStorage";

// =============================================================================
// Error Tests
// =============================================================================

describe("MimicDataStorage", () => {
  describe("StorageLoadError", () => {
    it("should have correct message", () => {
      const error = new MimicDataStorage.StorageLoadError({
        documentId: "doc-123",
        cause: new Error("Connection failed"),
      });
      expect(error.message).toBe(
        "Failed to load document doc-123: Error: Connection failed"
      );
      expect(error._tag).toBe("StorageLoadError");
      expect(error.documentId).toBe("doc-123");
    });
  });

  describe("StorageSaveError", () => {
    it("should have correct message", () => {
      const error = new MimicDataStorage.StorageSaveError({
        documentId: "doc-456",
        cause: new Error("Disk full"),
      });
      expect(error.message).toBe(
        "Failed to save document doc-456: Error: Disk full"
      );
      expect(error._tag).toBe("StorageSaveError");
      expect(error.documentId).toBe("doc-456");
    });
  });

  describe("StorageDeleteError", () => {
    it("should have correct message", () => {
      const error = new MimicDataStorage.StorageDeleteError({
        documentId: "doc-789",
        cause: new Error("Permission denied"),
      });
      expect(error.message).toBe(
        "Failed to delete document doc-789: Error: Permission denied"
      );
      expect(error._tag).toBe("StorageDeleteError");
      expect(error.documentId).toBe("doc-789");
    });
  });

  describe("make", () => {
    it("should create storage with required functions", async () => {
      const storage = MimicDataStorage.make({
        load: (documentId) => Effect.succeed({ id: documentId, data: "test" }),
        save: (_documentId, _state) => Effect.void,
      });

      const loaded = await Effect.runPromise(storage.load("doc-1"));
      expect(loaded).toEqual({ id: "doc-1", data: "test" });

      await Effect.runPromise(storage.save("doc-1", { data: "new" }));
    });

    it("should provide default delete implementation", async () => {
      const storage = MimicDataStorage.make({
        load: (_documentId) => Effect.succeed(undefined),
        save: (_documentId, _state) => Effect.void,
      });

      // Default delete should be a no-op
      await Effect.runPromise(storage.delete("doc-1"));
    });

    it("should provide default onLoad implementation (pass-through)", async () => {
      const storage = MimicDataStorage.make({
        load: (_documentId) => Effect.succeed(undefined),
        save: (_documentId, _state) => Effect.void,
      });

      const state = { title: "Test" };
      const result = await Effect.runPromise(storage.onLoad(state));
      expect(result).toBe(state);
    });

    it("should provide default onSave implementation (pass-through)", async () => {
      const storage = MimicDataStorage.make({
        load: (_documentId) => Effect.succeed(undefined),
        save: (_documentId, _state) => Effect.void,
      });

      const state = { title: "Test" };
      const result = await Effect.runPromise(storage.onSave(state));
      expect(result).toBe(state);
    });

    it("should accept custom delete implementation", async () => {
      let deletedId: string | null = null;
      const storage = MimicDataStorage.make({
        load: (_documentId) => Effect.succeed(undefined),
        save: (_documentId, _state) => Effect.void,
        delete: (documentId) => {
          deletedId = documentId;
          return Effect.void;
        },
      });

      await Effect.runPromise(storage.delete("doc-to-delete"));
      expect(deletedId).toBe("doc-to-delete");
    });

    it("should accept custom onLoad implementation", async () => {
      const storage = MimicDataStorage.make({
        load: (_documentId) => Effect.succeed(undefined),
        save: (_documentId, _state) => Effect.void,
        onLoad: (state) =>
          Effect.succeed({ ...(state as object), loaded: true }),
      });

      const result = await Effect.runPromise(
        storage.onLoad({ title: "Test" })
      );
      expect(result).toEqual({ title: "Test", loaded: true });
    });

    it("should accept custom onSave implementation", async () => {
      const storage = MimicDataStorage.make({
        load: (_documentId) => Effect.succeed(undefined),
        save: (_documentId, _state) => Effect.void,
        onSave: (state) =>
          Effect.succeed({ ...(state as object), savedAt: "now" }),
      });

      const result = await Effect.runPromise(
        storage.onSave({ title: "Test" })
      );
      expect(result).toEqual({ title: "Test", savedAt: "now" });
    });
  });

  describe("layer", () => {
    it("should create a layer that provides MimicDataStorageTag", async () => {
      const testStorage = MimicDataStorage.make({
        load: (_documentId) => Effect.succeed({ test: true }),
        save: (_documentId, _state) => Effect.void,
      });

      const testLayer = MimicDataStorage.layer(testStorage);

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* MimicDataStorage.MimicDataStorageTag;
          return yield* storage.load("doc-1");
        }).pipe(Effect.provide(testLayer))
      );

      expect(result).toEqual({ test: true });
    });
  });

  describe("layerEffect", () => {
    it("should create a layer from an Effect", async () => {
      const testLayer = MimicDataStorage.layerEffect(
        Effect.succeed(
          MimicDataStorage.make({
            load: (_documentId) => Effect.succeed({ fromEffect: true }),
            save: (_documentId, _state) => Effect.void,
          })
        )
      );

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* MimicDataStorage.MimicDataStorageTag;
          return yield* storage.load("doc-1");
        }).pipe(Effect.provide(testLayer))
      );

      expect(result).toEqual({ fromEffect: true });
    });
  });

  describe("MimicDataStorageTag", () => {
    it("should have the correct tag identifier", () => {
      expect(MimicDataStorage.MimicDataStorageTag.key).toBe(
        "@voidhash/mimic-server-effect/MimicDataStorage"
      );
    });
  });
});
