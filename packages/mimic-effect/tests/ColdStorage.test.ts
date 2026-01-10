import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import { ColdStorage, ColdStorageTag } from "../src/ColdStorage";
import { ColdStorageTestSuite } from "../src/testing";

describe("ColdStorage", () => {
  describe("InMemory", () => {
    // Use the test suite utilities for comprehensive testing
    const layer = ColdStorage.InMemory.make();

    // Run all test suite tests
    for (const test of ColdStorageTestSuite.makeTests()) {
      it(`[${test.category}] ${test.name}`, () =>
        Effect.runPromise(test.run.pipe(Effect.provide(layer)))
      );
    }
  });

  describe("Tag", () => {
    it("should have correct identifier", () => {
      expect(ColdStorageTag.key).toBe("@voidhash/mimic-effect/ColdStorage");
    });
  });
});
