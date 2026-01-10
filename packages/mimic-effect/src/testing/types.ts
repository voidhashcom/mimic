/**
 * @voidhash/mimic-effect/testing - Core Types
 *
 * Types used by the storage adapter test utilities.
 */
import { Data, Effect } from "effect";

// =============================================================================
// Error Types
// =============================================================================

/**
 * Error thrown when a test assertion fails.
 */
export class TestError extends Data.TaggedError("TestError")<{
  /** Description of what failed */
  readonly message: string;
  /** Expected value (if applicable) */
  readonly expected?: unknown;
  /** Actual value received (if applicable) */
  readonly actual?: unknown;
}> {}

// =============================================================================
// Test Case Types
// =============================================================================

/**
 * A single storage adapter test case.
 *
 * Test cases are framework-agnostic Effects that can be run with any test runner.
 *
 * @template E - The error type for this test case
 * @template R - The Effect requirements (e.g., ColdStorageTag or HotStorageTag)
 *
 * @example
 * ```typescript
 * // Using with vitest
 * const tests = ColdStorageTestSuite.makeTests();
 *
 * describe("MyAdapter", () => {
 *   for (const test of tests) {
 *     it(test.name, () =>
 *       Effect.runPromise(test.run.pipe(Effect.provide(myAdapterLayer)))
 *     );
 *   }
 * });
 * ```
 */
export interface StorageTestCase<E, R> {
  /** Human-readable test name */
  readonly name: string;
  /** Category for grouping (e.g., "Basic Operations", "Data Integrity") */
  readonly category: string;
  /** The test as an Effect - succeeds if test passes, fails with error if not */
  readonly run: Effect.Effect<void, E, R>;
}

// =============================================================================
// Test Results Types
// =============================================================================

/**
 * Result of a failed test.
 */
export interface FailedTest<E, R> {
  /** The test case that failed */
  readonly test: StorageTestCase<E, R>;
  /** The error that caused the failure */
  readonly error: E;
}

/**
 * Results from running all tests in a suite.
 *
 * @example
 * ```typescript
 * const results = await Effect.runPromise(
 *   ColdStorageTestSuite.runAll().pipe(Effect.provide(myAdapterLayer))
 * );
 *
 * console.log(`Passed: ${results.passCount}/${results.total}`);
 *
 * for (const { test, error } of results.failed) {
 *   console.error(`FAIL: ${test.name} - ${error._tag}`);
 * }
 * ```
 */
export interface TestResults<E, R> {
  /** Tests that passed */
  readonly passed: StorageTestCase<E, R>[];
  /** Tests that failed with their errors */
  readonly failed: FailedTest<E, R>[];
  /** Total number of tests run */
  readonly total: number;
  /** Number of tests that passed */
  readonly passCount: number;
  /** Number of tests that failed */
  readonly failCount: number;
}
