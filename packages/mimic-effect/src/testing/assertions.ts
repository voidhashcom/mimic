/**
 * @voidhash/mimic-effect/testing - Assertion Helpers
 *
 * Internal assertion helpers used by the test suites.
 */
import { Effect } from "effect";
import { TestError } from "./types";

// =============================================================================
// Deep Equality
// =============================================================================

/**
 * Deep equality check that handles objects, arrays, and primitives.
 * Skips function properties since reconstructed objects (like OperationPath)
 * will have new function instances even when the underlying data is identical.
 */
export const isDeepEqual = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;

  if (a === null || b === null) return a === b;
  if (a === undefined || b === undefined) return a === b;

  if (typeof a !== typeof b) return false;

  // Skip function comparison - functions with same behavior but different references should be considered equal
  if (typeof a === "function" && typeof b === "function") return true;

  if (typeof a === "number" && typeof b === "number") {
    if (Number.isNaN(a) && Number.isNaN(b)) return true;
    return a === b;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!isDeepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (typeof a === "object" && typeof b === "object") {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;

    // Filter out function properties for comparison
    const aKeys = Object.keys(aObj).filter(k => typeof aObj[k] !== "function");
    const bKeys = Object.keys(bObj).filter(k => typeof bObj[k] !== "function");

    if (aKeys.length !== bKeys.length) return false;

    for (const key of aKeys) {
      if (!Object.prototype.hasOwnProperty.call(bObj, key)) return false;
      if (!isDeepEqual(aObj[key], bObj[key])) return false;
    }

    return true;
  }

  return false;
};

// =============================================================================
// Assertion Helpers
// =============================================================================

/**
 * Assert that two values are deeply equal.
 */
export const assertEqual = <T>(
  actual: T,
  expected: T,
  message: string
): Effect.Effect<void, TestError> =>
  Effect.gen(function* () {
    if (!isDeepEqual(actual, expected)) {
      yield* Effect.fail(new TestError({ message, expected, actual }));
    }
  });

/**
 * Assert that a condition is true.
 */
export const assertTrue = (
  condition: boolean,
  message: string
): Effect.Effect<void, TestError> =>
  Effect.gen(function* () {
    if (!condition) {
      yield* Effect.fail(new TestError({ message }));
    }
  });

/**
 * Assert that a condition is false.
 */
export const assertFalse = (
  condition: boolean,
  message: string
): Effect.Effect<void, TestError> =>
  Effect.gen(function* () {
    if (condition) {
      yield* Effect.fail(new TestError({ message }));
    }
  });

/**
 * Assert that a value is undefined.
 */
export const assertUndefined = (
  value: unknown,
  message: string
): Effect.Effect<void, TestError> =>
  Effect.gen(function* () {
    if (value !== undefined) {
      yield* Effect.fail(
        new TestError({ message, expected: undefined, actual: value })
      );
    }
  });

/**
 * Assert that a value is defined (not undefined).
 */
export const assertDefined = <T>(
  value: T | undefined,
  message: string
): Effect.Effect<T, TestError> =>
  Effect.gen(function* () {
    if (value === undefined) {
      yield* Effect.fail(
        new TestError({ message, expected: "defined value", actual: undefined })
      );
    }
    return value as T;
  });

/**
 * Assert that an array has the expected length.
 */
export const assertLength = <T>(
  array: T[],
  expectedLength: number,
  message: string
): Effect.Effect<void, TestError> =>
  Effect.gen(function* () {
    if (array.length !== expectedLength) {
      yield* Effect.fail(
        new TestError({
          message,
          expected: expectedLength,
          actual: array.length,
        })
      );
    }
  });

/**
 * Assert that an array is empty.
 */
export const assertEmpty = <T>(
  array: T[],
  message: string
): Effect.Effect<void, TestError> => assertLength(array, 0, message);

/**
 * Assert that an array is sorted by a key.
 */
export const assertSortedBy = <T>(
  array: T[],
  key: keyof T,
  message: string
): Effect.Effect<void, TestError> =>
  Effect.gen(function* () {
    for (let i = 1; i < array.length; i++) {
      const prev = array[i - 1]![key];
      const curr = array[i]![key];
      if (prev > curr) {
        yield* Effect.fail(
          new TestError({
            message,
            expected: `array sorted by ${String(key)}`,
            actual: `element at index ${i - 1} (${prev}) > element at index ${i} (${curr})`,
          })
        );
      }
    }
  });
