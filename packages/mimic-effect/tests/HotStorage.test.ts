import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import { HotStorage, HotStorageTag } from "../src/HotStorage.js";
import type { WalEntry } from "../src/Types.js";
import { Transaction } from "@voidhash/mimic";

describe("HotStorage", () => {
  describe("InMemory", () => {
    const layer = HotStorage.InMemory.make();

    const makeEntry = (version: number): WalEntry => ({
      transaction: Transaction.make([]),
      version,
      timestamp: Date.now(),
    });

    it("should return empty array for missing document", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* HotStorageTag;
          return yield* storage.getEntries("non-existent", 0);
        }).pipe(Effect.provide(layer))
      );

      expect(result).toEqual([]);
    });

    it("should append and retrieve entries", async () => {
      const entry1 = makeEntry(1);
      const entry2 = makeEntry(2);

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* HotStorageTag;
          yield* storage.append("doc-1", entry1);
          yield* storage.append("doc-1", entry2);
          return yield* storage.getEntries("doc-1", 0);
        }).pipe(Effect.provide(layer))
      );

      expect(result.length).toBe(2);
      expect(result[0]!.version).toBe(1);
      expect(result[1]!.version).toBe(2);
    });

    it("should filter entries by sinceVersion", async () => {
      const entries = [makeEntry(1), makeEntry(2), makeEntry(3), makeEntry(4)];

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* HotStorageTag;
          for (const entry of entries) {
            yield* storage.append("doc-1", entry);
          }
          return yield* storage.getEntries("doc-1", 2);
        }).pipe(Effect.provide(layer))
      );

      expect(result.length).toBe(2);
      expect(result[0]!.version).toBe(3);
      expect(result[1]!.version).toBe(4);
    });

    it("should truncate entries up to version", async () => {
      const entries = [makeEntry(1), makeEntry(2), makeEntry(3), makeEntry(4)];

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* HotStorageTag;
          for (const entry of entries) {
            yield* storage.append("doc-1", entry);
          }
          yield* storage.truncate("doc-1", 2);
          return yield* storage.getEntries("doc-1", 0);
        }).pipe(Effect.provide(layer))
      );

      expect(result.length).toBe(2);
      expect(result[0]!.version).toBe(3);
      expect(result[1]!.version).toBe(4);
    });

    it("should maintain order after append", async () => {
      const entries = [makeEntry(3), makeEntry(1), makeEntry(2)];

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* HotStorageTag;
          for (const entry of entries) {
            yield* storage.append("doc-1", entry);
          }
          return yield* storage.getEntries("doc-1", 0);
        }).pipe(Effect.provide(layer))
      );

      // Should be sorted by version
      expect(result.length).toBe(3);
      expect(result[0]!.version).toBe(1);
      expect(result[1]!.version).toBe(2);
      expect(result[2]!.version).toBe(3);
    });

    it("should isolate documents", async () => {
      const entry1 = makeEntry(1);
      const entry2 = makeEntry(2);

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const storage = yield* HotStorageTag;
          yield* storage.append("doc-1", entry1);
          yield* storage.append("doc-2", entry2);

          const entries1 = yield* storage.getEntries("doc-1", 0);
          const entries2 = yield* storage.getEntries("doc-2", 0);

          return { entries1, entries2 };
        }).pipe(Effect.provide(layer))
      );

      expect(result.entries1.length).toBe(1);
      expect(result.entries1[0]!.version).toBe(1);
      expect(result.entries2.length).toBe(1);
      expect(result.entries2[0]!.version).toBe(2);
    });

    it("should not error when truncating non-existent document", async () => {
      await expect(
        Effect.runPromise(
          Effect.gen(function* () {
            const storage = yield* HotStorageTag;
            yield* storage.truncate("non-existent", 5);
          }).pipe(Effect.provide(layer))
        )
      ).resolves.toBeUndefined();
    });
  });

  describe("Tag", () => {
    it("should have correct identifier", () => {
      expect(HotStorageTag.key).toBe("@voidhash/mimic-effect/HotStorage");
    });
  });
});
