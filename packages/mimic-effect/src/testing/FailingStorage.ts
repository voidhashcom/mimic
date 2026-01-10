/**
 * @voidhash/mimic-effect/testing - FailingStorage
 *
 * Mock storage implementations that simulate failures for testing error handling.
 * Use these to verify that your application correctly handles storage unavailability.
 *
 * @example
 * ```typescript
 * import { FailingStorage } from "@voidhash/mimic-effect/testing";
 *
 * // Create a ColdStorage that fails on load
 * const failingCold = FailingStorage.makeColdStorage({ failLoad: true });
 *
 * // Create a HotStorage that fails after 3 successful appends
 * const failingHot = FailingStorage.makeHotStorage({ failAfterN: 3, failAppend: true });
 * ```
 */
import { Effect, Layer, Ref, HashMap } from "effect";
import { ColdStorageTag, type ColdStorage } from "../ColdStorage";
import { HotStorageTag, type HotStorage } from "../HotStorage";
import { ColdStorageError, HotStorageError, WalVersionGapError } from "../Errors";
import type { StoredDocument, WalEntry } from "../Types";

// =============================================================================
// Configuration Types
// =============================================================================

/**
 * Configuration for failing ColdStorage
 */
export interface FailingColdStorageConfig {
  /** Fail load operations */
  readonly failLoad?: boolean;
  /** Fail save operations */
  readonly failSave?: boolean;
  /** Fail delete operations */
  readonly failDelete?: boolean;
  /** Fail after N successful operations (total across all operation types) */
  readonly failAfterN?: number;
  /** Custom error message */
  readonly errorMessage?: string;
}

/**
 * Configuration for failing HotStorage
 */
export interface FailingHotStorageConfig {
  /** Fail append operations */
  readonly failAppend?: boolean;
  /** Fail getEntries operations */
  readonly failGetEntries?: boolean;
  /** Fail truncate operations */
  readonly failTruncate?: boolean;
  /** Fail after N successful operations (total across all operation types) */
  readonly failAfterN?: number;
  /** Custom error message */
  readonly errorMessage?: string;
}

// =============================================================================
// Failing ColdStorage
// =============================================================================

/**
 * Create a ColdStorage layer that simulates failures.
 * Wraps an in-memory storage and fails according to configuration.
 */
export const makeColdStorage = (
  config: FailingColdStorageConfig = {}
): Layer.Layer<ColdStorageTag> =>
  Layer.effect(
    ColdStorageTag,
    Effect.gen(function* () {
      const store = yield* Ref.make(HashMap.empty<string, StoredDocument>());
      const operationCount = yield* Ref.make(0);

      const errorMessage = config.errorMessage ?? "Simulated storage failure";

      const shouldFail = (operation: "load" | "save" | "delete") =>
        Effect.gen(function* () {
          // Check if this specific operation should fail
          const opFails =
            (operation === "load" && config.failLoad) ||
            (operation === "save" && config.failSave) ||
            (operation === "delete" && config.failDelete);

          // If failAfterN is set, count operations first
          if (config.failAfterN !== undefined) {
            const count = yield* Ref.get(operationCount);
            yield* Ref.update(operationCount, (n) => n + 1);

            // Only start failing after N successful operations
            if (count < config.failAfterN) {
              return false;
            }
            // After N operations, fail if the specific op flag is set
            return opFails;
          }

          // No failAfterN - fail immediately if op flag is set
          return opFails;
        });

      const storage: ColdStorage = {
        load: (documentId) =>
          Effect.gen(function* () {
            const fail = yield* shouldFail("load");
            if (fail) {
              return yield* Effect.fail(
                new ColdStorageError({
                  documentId,
                  operation: "load",
                  cause: new Error(errorMessage),
                })
              );
            }

            const current = yield* Ref.get(store);
            const doc = HashMap.get(current, documentId);
            return doc._tag === "Some" ? doc.value : undefined;
          }),

        save: (documentId, document) =>
          Effect.gen(function* () {
            const fail = yield* shouldFail("save");
            if (fail) {
              return yield* Effect.fail(
                new ColdStorageError({
                  documentId,
                  operation: "save",
                  cause: new Error(errorMessage),
                })
              );
            }

            yield* Ref.update(store, (map) =>
              HashMap.set(map, documentId, document)
            );
          }),

        delete: (documentId) =>
          Effect.gen(function* () {
            const fail = yield* shouldFail("delete");
            if (fail) {
              return yield* Effect.fail(
                new ColdStorageError({
                  documentId,
                  operation: "delete",
                  cause: new Error(errorMessage),
                })
              );
            }

            yield* Ref.update(store, (map) => HashMap.remove(map, documentId));
          }),
      };

      return storage;
    })
  );

// =============================================================================
// Failing HotStorage
// =============================================================================

/**
 * Create a HotStorage layer that simulates failures.
 * Wraps an in-memory storage and fails according to configuration.
 */
export const makeHotStorage = (
  config: FailingHotStorageConfig = {}
): Layer.Layer<HotStorageTag> =>
  Layer.effect(
    HotStorageTag,
    Effect.gen(function* () {
      const store = yield* Ref.make(HashMap.empty<string, WalEntry[]>());
      const operationCount = yield* Ref.make(0);

      const errorMessage = config.errorMessage ?? "Simulated storage failure";

      const shouldFail = (operation: "append" | "getEntries" | "truncate") =>
        Effect.gen(function* () {
          // Check if this specific operation should fail
          const opFails =
            (operation === "append" && config.failAppend) ||
            (operation === "getEntries" && config.failGetEntries) ||
            (operation === "truncate" && config.failTruncate);

          // If failAfterN is set, count operations first
          if (config.failAfterN !== undefined) {
            const count = yield* Ref.get(operationCount);
            yield* Ref.update(operationCount, (n) => n + 1);

            // Only start failing after N successful operations
            if (count < config.failAfterN) {
              return false;
            }
            // After N operations, fail if the specific op flag is set
            return opFails;
          }

          // No failAfterN - fail immediately if op flag is set
          return opFails;
        });

      const storage: HotStorage = {
        append: (documentId, entry) =>
          Effect.gen(function* () {
            const fail = yield* shouldFail("append");
            if (fail) {
              return yield* Effect.fail(
                new HotStorageError({
                  documentId,
                  operation: "append",
                  cause: new Error(errorMessage),
                })
              );
            }

            yield* Ref.update(store, (map) => {
              const current = HashMap.get(map, documentId);
              const entries = current._tag === "Some" ? current.value : [];
              return HashMap.set(map, documentId, [...entries, entry]);
            });
          }),

        appendWithCheck: (documentId, entry, expectedVersion) =>
          Effect.gen(function* () {
            const fail = yield* shouldFail("append");
            if (fail) {
              return yield* Effect.fail(
                new HotStorageError({
                  documentId,
                  operation: "appendWithCheck",
                  cause: new Error(errorMessage),
                })
              );
            }

            type CheckResult =
              | { type: "ok" }
              | { type: "gap"; lastVersion: number | undefined };

            const result: CheckResult = yield* Ref.modify(store, (map): [CheckResult, HashMap.HashMap<string, WalEntry[]>] => {
              const existing = HashMap.get(map, documentId);
              const entries = existing._tag === "Some" ? existing.value : [];

              const lastVersion = entries.length > 0
                ? Math.max(...entries.map((e) => e.version))
                : 0;

              if (expectedVersion === 1) {
                if (lastVersion >= 1) {
                  return [{ type: "gap", lastVersion }, map];
                }
              } else {
                if (lastVersion !== expectedVersion - 1) {
                  return [{ type: "gap", lastVersion: lastVersion > 0 ? lastVersion : undefined }, map];
                }
              }

              return [
                { type: "ok" },
                HashMap.set(map, documentId, [...entries, entry]),
              ];
            });

            if (result.type === "gap") {
              return yield* Effect.fail(
                new WalVersionGapError({
                  documentId,
                  expectedVersion,
                  actualPreviousVersion: result.lastVersion,
                })
              );
            }
          }),

        getEntries: (documentId, sinceVersion) =>
          Effect.gen(function* () {
            const fail = yield* shouldFail("getEntries");
            if (fail) {
              return yield* Effect.fail(
                new HotStorageError({
                  documentId,
                  operation: "getEntries",
                  cause: new Error(errorMessage),
                })
              );
            }

            const current = yield* Ref.get(store);
            const existing = HashMap.get(current, documentId);
            const entries = existing._tag === "Some" ? existing.value : [];

            return entries
              .filter((e) => e.version > sinceVersion)
              .sort((a, b) => a.version - b.version);
          }),

        truncate: (documentId, upToVersion) =>
          Effect.gen(function* () {
            const fail = yield* shouldFail("truncate");
            if (fail) {
              return yield* Effect.fail(
                new HotStorageError({
                  documentId,
                  operation: "truncate",
                  cause: new Error(errorMessage),
                })
              );
            }

            yield* Ref.update(store, (map) => {
              const existing = HashMap.get(map, documentId);
              if (existing._tag === "None") {
                return map;
              }
              const filtered = existing.value.filter(
                (e) => e.version > upToVersion
              );
              return HashMap.set(map, documentId, filtered);
            });
          }),
      };

      return storage;
    })
  );

// =============================================================================
// Export Namespace
// =============================================================================

export const FailingStorage = {
  makeColdStorage,
  makeHotStorage,
};
