import { describe, it, expect } from "vitest";
import { Effect, Layer } from "effect";
import { StorageIntegrationTestSuite } from "../src/testing/StorageIntegrationTestSuite";
import { FailingStorage } from "../src/testing/FailingStorage";
import { ColdStorage, ColdStorageTag } from "../src/ColdStorage";
import { HotStorage, HotStorageTag } from "../src/HotStorage";

// =============================================================================
// Storage Integration Tests
// =============================================================================

describe("Storage Integration", () => {
  const layer = Layer.mergeAll(
    ColdStorage.InMemory.make(),
    HotStorage.InMemory.make()
  );

  for (const test of StorageIntegrationTestSuite.makeTests()) {
    it(test.name, () =>
      Effect.runPromise(test.run.pipe(Effect.provide(layer)))
    );
  }
});

// =============================================================================
// Failure Scenario Tests
// =============================================================================

describe("Storage Failure Scenarios", () => {
  describe("ColdStorage Failures", () => {
    it("load failure propagates error", async () => {
      const failingLayer = Layer.mergeAll(
        FailingStorage.makeColdStorage({ failLoad: true }),
        HotStorage.InMemory.make()
      );

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const cold = yield* ColdStorageTag;
          return yield* Effect.either(cold.load("test-doc"));
        }).pipe(Effect.provide(failingLayer))
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("ColdStorageError");
      }
    });

    it("save failure propagates error", async () => {
      const failingLayer = Layer.mergeAll(
        FailingStorage.makeColdStorage({ failSave: true }),
        HotStorage.InMemory.make()
      );

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const cold = yield* ColdStorageTag;
          return yield* Effect.either(
            cold.save("test-doc", {
              state: { data: "test" },
              version: 1,
              schemaVersion: 1,
              savedAt: Date.now(),
            })
          );
        }).pipe(Effect.provide(failingLayer))
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("ColdStorageError");
      }
    });

    it("failAfterN allows first N operations then fails", async () => {
      const failingLayer = Layer.mergeAll(
        FailingStorage.makeColdStorage({ failAfterN: 2, failLoad: true }),
        HotStorage.InMemory.make()
      );

      const results = await Effect.runPromise(
        Effect.gen(function* () {
          const cold = yield* ColdStorageTag;

          // First 2 operations succeed
          const r1 = yield* Effect.either(cold.load("doc-1"));
          const r2 = yield* Effect.either(cold.load("doc-2"));

          // Third operation fails
          const r3 = yield* Effect.either(cold.load("doc-3"));

          return { r1, r2, r3 };
        }).pipe(Effect.provide(failingLayer))
      );

      expect(results.r1._tag).toBe("Right");
      expect(results.r2._tag).toBe("Right");
      expect(results.r3._tag).toBe("Left");
    });
  });

  describe("HotStorage Failures", () => {
    it("append failure propagates error", async () => {
      const failingLayer = Layer.mergeAll(
        ColdStorage.InMemory.make(),
        FailingStorage.makeHotStorage({ failAppend: true })
      );

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const hot = yield* HotStorageTag;
          return yield* Effect.either(
            hot.append("test-doc", {
              transaction: { id: "tx-1", ops: [], timestamp: Date.now() },
              version: 1,
              timestamp: Date.now(),
            })
          );
        }).pipe(Effect.provide(failingLayer))
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("HotStorageError");
      }
    });

    it("getEntries failure propagates error", async () => {
      const failingLayer = Layer.mergeAll(
        ColdStorage.InMemory.make(),
        FailingStorage.makeHotStorage({ failGetEntries: true })
      );

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const hot = yield* HotStorageTag;
          return yield* Effect.either(hot.getEntries("test-doc", 0));
        }).pipe(Effect.provide(failingLayer))
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("HotStorageError");
      }
    });

    it("truncate failure propagates error", async () => {
      const failingLayer = Layer.mergeAll(
        ColdStorage.InMemory.make(),
        FailingStorage.makeHotStorage({ failTruncate: true })
      );

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const hot = yield* HotStorageTag;
          return yield* Effect.either(hot.truncate("test-doc", 5));
        }).pipe(Effect.provide(failingLayer))
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left._tag).toBe("HotStorageError");
      }
    });

    it("failAfterN allows first N operations then fails", async () => {
      const failingLayer = Layer.mergeAll(
        ColdStorage.InMemory.make(),
        FailingStorage.makeHotStorage({ failAfterN: 3, failAppend: true })
      );

      const results = await Effect.runPromise(
        Effect.gen(function* () {
          const hot = yield* HotStorageTag;

          const makeEntry = (v: number) => ({
            transaction: { id: `tx-${v}`, ops: [], timestamp: Date.now() },
            version: v,
            timestamp: Date.now(),
          });

          // First 3 appends succeed
          const r1 = yield* Effect.either(hot.append("doc", makeEntry(1)));
          const r2 = yield* Effect.either(hot.append("doc", makeEntry(2)));
          const r3 = yield* Effect.either(hot.append("doc", makeEntry(3)));

          // Fourth append fails
          const r4 = yield* Effect.either(hot.append("doc", makeEntry(4)));

          return { r1, r2, r3, r4 };
        }).pipe(Effect.provide(failingLayer))
      );

      expect(results.r1._tag).toBe("Right");
      expect(results.r2._tag).toBe("Right");
      expect(results.r3._tag).toBe("Right");
      expect(results.r4._tag).toBe("Left");
    });
  });

  describe("Custom Error Messages", () => {
    it("ColdStorage uses custom error message", async () => {
      const failingLayer = Layer.mergeAll(
        FailingStorage.makeColdStorage({
          failLoad: true,
          errorMessage: "Database connection timeout",
        }),
        HotStorage.InMemory.make()
      );

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const cold = yield* ColdStorageTag;
          return yield* Effect.either(cold.load("test-doc"));
        }).pipe(Effect.provide(failingLayer))
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left.cause).toBeInstanceOf(Error);
        expect((result.left.cause as Error).message).toBe(
          "Database connection timeout"
        );
      }
    });

    it("HotStorage uses custom error message", async () => {
      const failingLayer = Layer.mergeAll(
        ColdStorage.InMemory.make(),
        FailingStorage.makeHotStorage({
          failAppend: true,
          errorMessage: "Redis cluster unavailable",
        })
      );

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const hot = yield* HotStorageTag;
          return yield* Effect.either(
            hot.append("test-doc", {
              transaction: { id: "tx", ops: [], timestamp: Date.now() },
              version: 1,
              timestamp: Date.now(),
            })
          );
        }).pipe(Effect.provide(failingLayer))
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left.cause).toBeInstanceOf(Error);
        expect((result.left.cause as Error).message).toBe(
          "Redis cluster unavailable"
        );
      }
    });
  });
});
