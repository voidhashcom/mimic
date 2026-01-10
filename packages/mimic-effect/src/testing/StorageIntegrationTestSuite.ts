/**
 * @voidhash/mimic-effect/testing - StorageIntegrationTestSuite
 *
 * Integration tests for verifying Hot/Cold storage coordination.
 * Tests snapshot + WAL replay, failure handling, and version verification.
 *
 * @example
 * ```typescript
 * import { StorageIntegrationTestSuite } from "@voidhash/mimic-effect/testing";
 * import { describe, it } from "vitest";
 * import { Effect, Layer } from "effect";
 * import { ColdStorage, HotStorage } from "@voidhash/mimic-effect";
 *
 * describe("Storage Integration", () => {
 *   const layer = Layer.mergeAll(
 *     ColdStorage.InMemory.make(),
 *     HotStorage.InMemory.make()
 *   );
 *
 *   for (const test of StorageIntegrationTestSuite.makeTests()) {
 *     it(test.name, () =>
 *       Effect.runPromise(test.run.pipe(Effect.provide(layer)))
 *     );
 *   }
 * });
 * ```
 */
import { Effect } from "effect";
import { ColdStorageTag } from "../ColdStorage";
import { HotStorageTag } from "../HotStorage";
import { ColdStorageError, HotStorageError } from "../Errors";
import type { StoredDocument, WalEntry } from "../Types";
import type { StorageTestCase } from "./types";
import {
  assertEqual,
  assertTrue,
  assertLength,
  assertEmpty,
  assertDefined,
  assertUndefined,
} from "./assertions";

// =============================================================================
// Test Categories
// =============================================================================

export const Categories = {
  SNAPSHOT_WAL_COORDINATION: "Snapshot + WAL Coordination",
  VERSION_VERIFICATION: "Version Verification",
  RECOVERY_SCENARIOS: "Recovery Scenarios",
} as const;

// =============================================================================
// Test Helpers
// =============================================================================

const makeSnapshot = (
  version: number,
  state: unknown = { data: `v${version}` }
): StoredDocument => ({
  state,
  version,
  schemaVersion: 1,
  savedAt: Date.now(),
});

const makeWalEntry = (
  version: number,
  ops: unknown[] = [{ type: "set", path: ["data"], value: `v${version}` }]
): WalEntry => ({
  transaction: {
    id: `tx-${version}`,
    ops,
    timestamp: Date.now(),
  },
  version,
  timestamp: Date.now(),
});

// =============================================================================
// Test Definitions
// =============================================================================

type IntegrationTestCase = StorageTestCase<ColdStorageError | HotStorageError, ColdStorageTag | HotStorageTag>;

const snapshotWalCoordinationTests: IntegrationTestCase[] = [
  {
    name: "load empty document returns undefined snapshot and empty WAL",
    category: Categories.SNAPSHOT_WAL_COORDINATION,
    run: Effect.gen(function* () {
      const cold = yield* ColdStorageTag;
      const hot = yield* HotStorageTag;

      const snapshot = yield* cold.load("empty-doc");
      const walEntries = yield* hot.getEntries("empty-doc", 0);

      assertUndefined(snapshot, "Snapshot should be undefined for new doc");
      assertEmpty(walEntries, "WAL should be empty for new doc");
    }),
  },

  {
    name: "restore from snapshot only (no WAL)",
    category: Categories.SNAPSHOT_WAL_COORDINATION,
    run: Effect.gen(function* () {
      const cold = yield* ColdStorageTag;
      const hot = yield* HotStorageTag;

      const docId = "snapshot-only";
      const snapshot = makeSnapshot(5, { title: "Hello" });

      yield* cold.save(docId, snapshot);

      const loaded = yield* cold.load(docId);
      const walEntries = yield* hot.getEntries(docId, 5);

      assertDefined(loaded, "Snapshot should be loaded");
      assertEqual(loaded!.version, 5, "Snapshot version should match");
      assertEqual(loaded!.state, { title: "Hello" }, "Snapshot state should match");
      assertEmpty(walEntries, "WAL should be empty after snapshot version");
    }),
  },

  {
    name: "restore from WAL only (no snapshot)",
    category: Categories.SNAPSHOT_WAL_COORDINATION,
    run: Effect.gen(function* () {
      const cold = yield* ColdStorageTag;
      const hot = yield* HotStorageTag;

      const docId = "wal-only";

      yield* hot.append(docId, makeWalEntry(1));
      yield* hot.append(docId, makeWalEntry(2));
      yield* hot.append(docId, makeWalEntry(3));

      const snapshot = yield* cold.load(docId);
      const walEntries = yield* hot.getEntries(docId, 0);

      assertUndefined(snapshot, "No snapshot should exist");
      assertLength(walEntries, 3, "Should have 3 WAL entries");
      assertEqual(walEntries[0]!.version, 1, "First entry should be v1");
      assertEqual(walEntries[2]!.version, 3, "Last entry should be v3");
    }),
  },

  {
    name: "restore from snapshot + WAL replay",
    category: Categories.SNAPSHOT_WAL_COORDINATION,
    run: Effect.gen(function* () {
      const cold = yield* ColdStorageTag;
      const hot = yield* HotStorageTag;

      const docId = "snapshot-plus-wal";

      // Save snapshot at v5
      yield* cold.save(docId, makeSnapshot(5));

      // Add WAL entries for v6, v7, v8
      yield* hot.append(docId, makeWalEntry(6));
      yield* hot.append(docId, makeWalEntry(7));
      yield* hot.append(docId, makeWalEntry(8));

      const snapshot = yield* cold.load(docId);
      const walEntries = yield* hot.getEntries(docId, snapshot!.version);

      assertEqual(snapshot!.version, 5, "Snapshot at v5");
      assertLength(walEntries, 3, "3 WAL entries after snapshot");
      assertEqual(walEntries[0]!.version, 6, "First WAL entry is v6");
      assertEqual(walEntries[2]!.version, 8, "Last WAL entry is v8");
    }),
  },

  {
    name: "truncate WAL after snapshot",
    category: Categories.SNAPSHOT_WAL_COORDINATION,
    run: Effect.gen(function* () {
      const cold = yield* ColdStorageTag;
      const hot = yield* HotStorageTag;

      const docId = "truncate-test";

      // Add WAL entries 1-5
      for (let i = 1; i <= 5; i++) {
        yield* hot.append(docId, makeWalEntry(i));
      }

      // Save snapshot at v3
      yield* cold.save(docId, makeSnapshot(3));

      // Truncate WAL up to v3
      yield* hot.truncate(docId, 3);

      const walEntries = yield* hot.getEntries(docId, 0);

      assertLength(walEntries, 2, "Only v4 and v5 should remain");
      assertEqual(walEntries[0]!.version, 4, "First remaining is v4");
      assertEqual(walEntries[1]!.version, 5, "Last remaining is v5");
    }),
  },

  {
    name: "snapshot overwrites previous snapshot",
    category: Categories.SNAPSHOT_WAL_COORDINATION,
    run: Effect.gen(function* () {
      const cold = yield* ColdStorageTag;

      const docId = "overwrite-test";

      yield* cold.save(docId, makeSnapshot(1, { old: true }));
      yield* cold.save(docId, makeSnapshot(5, { new: true }));

      const loaded = yield* cold.load(docId);

      assertEqual(loaded!.version, 5, "Should have newer version");
      assertEqual(loaded!.state, { new: true }, "Should have newer state");
    }),
  },
];

const versionVerificationTests: IntegrationTestCase[] = [
  {
    name: "WAL entries are ordered by version",
    category: Categories.VERSION_VERIFICATION,
    run: Effect.gen(function* () {
      const hot = yield* HotStorageTag;

      const docId = "ordering-test";

      // Append out of order
      yield* hot.append(docId, makeWalEntry(3));
      yield* hot.append(docId, makeWalEntry(1));
      yield* hot.append(docId, makeWalEntry(2));

      const entries = yield* hot.getEntries(docId, 0);

      assertLength(entries, 3, "All entries should be returned");
      assertEqual(entries[0]!.version, 1, "First should be v1");
      assertEqual(entries[1]!.version, 2, "Second should be v2");
      assertEqual(entries[2]!.version, 3, "Third should be v3");
    }),
  },

  {
    name: "getEntries filters by sinceVersion correctly",
    category: Categories.VERSION_VERIFICATION,
    run: Effect.gen(function* () {
      const hot = yield* HotStorageTag;

      const docId = "filter-test";

      for (let i = 1; i <= 10; i++) {
        yield* hot.append(docId, makeWalEntry(i));
      }

      const fromV5 = yield* hot.getEntries(docId, 5);
      const fromV8 = yield* hot.getEntries(docId, 8);
      const fromV10 = yield* hot.getEntries(docId, 10);

      assertLength(fromV5, 5, "v6-v10 = 5 entries");
      assertEqual(fromV5[0]!.version, 6, "First entry after v5 is v6");

      assertLength(fromV8, 2, "v9-v10 = 2 entries");
      assertEqual(fromV8[0]!.version, 9, "First entry after v8 is v9");

      assertEmpty(fromV10, "No entries after v10");
    }),
  },

  {
    name: "detect version gap between snapshot and WAL",
    category: Categories.VERSION_VERIFICATION,
    run: Effect.gen(function* () {
      const cold = yield* ColdStorageTag;
      const hot = yield* HotStorageTag;

      const docId = "gap-detection";

      // Snapshot at v5
      yield* cold.save(docId, makeSnapshot(5));

      // WAL starts at v7 (gap: v6 missing)
      yield* hot.append(docId, makeWalEntry(7));
      yield* hot.append(docId, makeWalEntry(8));

      const snapshot = yield* cold.load(docId);
      const walEntries = yield* hot.getEntries(docId, snapshot!.version);

      assertEqual(snapshot!.version, 5, "Snapshot at v5");
      assertLength(walEntries, 2, "Two WAL entries");

      // Gap detection: first WAL entry should be v6, but it's v7
      const firstWalVersion = walEntries[0]!.version;
      const expectedFirst = snapshot!.version + 1;
      const hasGap = firstWalVersion !== expectedFirst;

      assertTrue(hasGap, "Should detect gap (v7 != v6)");
    }),
  },

  {
    name: "detect internal WAL gaps",
    category: Categories.VERSION_VERIFICATION,
    run: Effect.gen(function* () {
      const hot = yield* HotStorageTag;

      const docId = "internal-gap";

      yield* hot.append(docId, makeWalEntry(1));
      yield* hot.append(docId, makeWalEntry(2));
      // Skip v3
      yield* hot.append(docId, makeWalEntry(4));
      yield* hot.append(docId, makeWalEntry(5));

      const entries = yield* hot.getEntries(docId, 0);

      // Check for internal gaps
      let gapFound = false;
      for (let i = 1; i < entries.length; i++) {
        const prev = entries[i - 1]!.version;
        const curr = entries[i]!.version;
        if (curr !== prev + 1) {
          gapFound = true;
          break;
        }
      }

      assertTrue(gapFound, "Should detect internal gap between v2 and v4");
    }),
  },

  {
    name: "no gap when WAL is continuous",
    category: Categories.VERSION_VERIFICATION,
    run: Effect.gen(function* () {
      const cold = yield* ColdStorageTag;
      const hot = yield* HotStorageTag;

      const docId = "no-gap";

      yield* cold.save(docId, makeSnapshot(5));
      yield* hot.append(docId, makeWalEntry(6));
      yield* hot.append(docId, makeWalEntry(7));
      yield* hot.append(docId, makeWalEntry(8));

      const snapshot = yield* cold.load(docId);
      const walEntries = yield* hot.getEntries(docId, snapshot!.version);

      const firstWalVersion = walEntries[0]!.version;
      const expectedFirst = snapshot!.version + 1;
      const hasGap = firstWalVersion !== expectedFirst;

      assertTrue(!hasGap, "Should not detect gap (v6 == v6)");
    }),
  },
];

const recoveryScenarioTests: IntegrationTestCase[] = [
  {
    name: "full recovery: snapshot + WAL + new transactions",
    category: Categories.RECOVERY_SCENARIOS,
    run: Effect.gen(function* () {
      const cold = yield* ColdStorageTag;
      const hot = yield* HotStorageTag;

      const docId = "full-recovery";

      // Initial state: snapshot at v3, WAL v4-v5
      yield* cold.save(docId, makeSnapshot(3, { count: 3 }));
      yield* hot.append(docId, makeWalEntry(4));
      yield* hot.append(docId, makeWalEntry(5));

      // "Recovery" - load snapshot and WAL
      const snapshot = yield* cold.load(docId);
      const walEntries = yield* hot.getEntries(docId, snapshot!.version);

      assertEqual(snapshot!.version, 3, "Snapshot version");
      assertLength(walEntries, 2, "WAL entries to replay");

      // Simulate new transaction after recovery
      yield* hot.append(docId, makeWalEntry(6));

      const newWal = yield* hot.getEntries(docId, 5);
      assertLength(newWal, 1, "One new entry after recovery");
      assertEqual(newWal[0]!.version, 6, "New entry is v6");
    }),
  },

  {
    name: "recovery from only WAL (cold start)",
    category: Categories.RECOVERY_SCENARIOS,
    run: Effect.gen(function* () {
      const cold = yield* ColdStorageTag;
      const hot = yield* HotStorageTag;

      const docId = "cold-start";

      // Only WAL entries, no snapshot (new document that hasn't been snapshotted)
      yield* hot.append(docId, makeWalEntry(1));
      yield* hot.append(docId, makeWalEntry(2));

      const snapshot = yield* cold.load(docId);
      const walEntries = yield* hot.getEntries(docId, 0);

      assertUndefined(snapshot, "No snapshot exists");
      assertLength(walEntries, 2, "All WAL entries from beginning");
    }),
  },

  {
    name: "recovery after truncation failure (WAL has old entries)",
    category: Categories.RECOVERY_SCENARIOS,
    run: Effect.gen(function* () {
      const cold = yield* ColdStorageTag;
      const hot = yield* HotStorageTag;

      const docId = "truncate-failed";

      // Simulate: snapshot saved at v5, but truncate failed
      // So WAL still has v3, v4, v5, v6
      yield* hot.append(docId, makeWalEntry(3));
      yield* hot.append(docId, makeWalEntry(4));
      yield* hot.append(docId, makeWalEntry(5));
      yield* hot.append(docId, makeWalEntry(6));

      yield* cold.save(docId, makeSnapshot(5));

      // Recovery should only replay v6
      const snapshot = yield* cold.load(docId);
      const walEntries = yield* hot.getEntries(docId, snapshot!.version);

      assertEqual(snapshot!.version, 5, "Snapshot at v5");
      assertLength(walEntries, 1, "Only v6 should be replayed");
      assertEqual(walEntries[0]!.version, 6, "Entry is v6");
    }),
  },

  {
    name: "idempotent snapshot save",
    category: Categories.RECOVERY_SCENARIOS,
    run: Effect.gen(function* () {
      const cold = yield* ColdStorageTag;

      const docId = "idempotent";

      const snapshot1 = makeSnapshot(5, { first: true });
      const snapshot2 = makeSnapshot(5, { second: true });

      yield* cold.save(docId, snapshot1);
      yield* cold.save(docId, snapshot2);

      const loaded = yield* cold.load(docId);

      // Last write wins
      assertEqual(loaded!.state, { second: true }, "Second save overwrites");
    }),
  },
];

// =============================================================================
// Test Suite Export
// =============================================================================

/**
 * Generate all integration test cases
 */
export const makeTests = (): IntegrationTestCase[] => [
  ...snapshotWalCoordinationTests,
  ...versionVerificationTests,
  ...recoveryScenarioTests,
];

/**
 * Run all integration tests and collect results
 */
export const runAll = <R>(
  layer: import("effect").Layer.Layer<ColdStorageTag | HotStorageTag, never, R>
) =>
  Effect.gen(function* () {
    const tests = makeTests();
    const results: Array<{ name: string; passed: boolean; error?: unknown }> = [];

    for (const test of tests) {
      const result = yield* Effect.either(test.run.pipe(Effect.provide(layer)));

      if (result._tag === "Right") {
        results.push({ name: test.name, passed: true });
      } else {
        results.push({ name: test.name, passed: false, error: result.left });
      }
    }

    return results;
  });

// =============================================================================
// Export Namespace
// =============================================================================

export const StorageIntegrationTestSuite = {
  Categories,
  makeTests,
  runAll,
};
