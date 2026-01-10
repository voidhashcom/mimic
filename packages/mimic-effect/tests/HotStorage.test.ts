import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import { HotStorage, HotStorageTag } from "../src/HotStorage";
import { HotStorageTestSuite } from "../src/testing";

describe("HotStorage", () => {
  describe("InMemory", () => {
    // Use the test suite utilities for comprehensive testing
    const layer = HotStorage.InMemory.make();

    // Run all test suite tests
    for (const test of HotStorageTestSuite.makeTests()) {
      it(`[${test.category}] ${test.name}`, () =>
        Effect.runPromise(test.run.pipe(Effect.provide(layer)))
      );
    }
  });

  describe("Tag", () => {
    it("should have correct identifier", () => {
      expect(HotStorageTag.key).toBe("@voidhash/mimic-effect/HotStorage");
    });
  });
});
