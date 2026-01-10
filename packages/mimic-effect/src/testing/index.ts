/**
 * @voidhash/mimic-effect/testing
 *
 * Test utilities for verifying ColdStorage and HotStorage adapter implementations.
 *
 * These utilities help ensure that custom storage adapters correctly implement
 * the required interfaces and can reliably persist/retrieve data without loss.
 *
 * @example
 * ```typescript
 * import { ColdStorageTestSuite, HotStorageTestSuite } from "@voidhash/mimic-effect/testing";
 * import { describe, it } from "vitest";
 * import { Effect } from "effect";
 *
 * // Test your ColdStorage adapter
 * describe("MyColdStorageAdapter", () => {
 *   const layer = MyColdStorageAdapter.make();
 *
 *   for (const test of ColdStorageTestSuite.makeTests()) {
 *     it(test.name, () =>
 *       Effect.runPromise(test.run.pipe(Effect.provide(layer)))
 *     );
 *   }
 * });
 *
 * // Test your HotStorage adapter
 * describe("MyHotStorageAdapter", () => {
 *   const layer = MyHotStorageAdapter.make();
 *
 *   for (const test of HotStorageTestSuite.makeTests()) {
 *     it(test.name, () =>
 *       Effect.runPromise(test.run.pipe(Effect.provide(layer)))
 *     );
 *   }
 * });
 * ```
 *
 * @since 1.0.0
 */

// =============================================================================
// Types
// =============================================================================

export type {
  StorageTestCase,
  TestResults,
  FailedTest,
} from "./types";

export { TestError } from "./types";

// =============================================================================
// Test Suites
// =============================================================================

export {
  ColdStorageTestSuite,
  type ColdStorageTestError,
} from "./ColdStorageTestSuite";
export {
  HotStorageTestSuite,
  type HotStorageTestError,
} from "./HotStorageTestSuite";

// =============================================================================
// Re-export Categories for Convenience
// =============================================================================

export { Categories as ColdStorageCategories } from "./ColdStorageTestSuite";
export { Categories as HotStorageCategories } from "./HotStorageTestSuite";
