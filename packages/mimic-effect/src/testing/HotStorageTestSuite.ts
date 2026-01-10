/**
 * @voidhash/mimic-effect/testing - HotStorage Test Suite
 *
 * Comprehensive test suite for HotStorage (WAL) adapter implementations.
 * These tests verify that an adapter correctly implements the HotStorage interface
 * and can reliably store/retrieve WAL entries for document recovery.
 */
import { Effect, Schema } from "effect";
import { Transaction, OperationPath, Operation, OperationDefinition } from "@voidhash/mimic";
import { HotStorageTag } from "../HotStorage";
import { type HotStorageError, WalVersionGapError } from "../Errors";
import type { WalEntry } from "../Types";
import type { StorageTestCase, TestResults } from "./types";
import { TestError } from "./types";
import {
  assertEqual,
  assertLength,
  assertEmpty,
  assertSortedBy,
  assertTrue,
} from "./assertions";

/**
 * Error type for HotStorage tests - can be either a TestError, HotStorageError, or WalVersionGapError
 */
export type HotStorageTestError = TestError | HotStorageError | WalVersionGapError;

// =============================================================================
// Test Operation Definitions
// =============================================================================

/**
 * Test operation definition for creating proper Operation objects in tests.
 * Using Schema.Unknown allows any payload type for flexibility in testing.
 */
const TestSetDefinition = OperationDefinition.make({
  kind: "test.set" as const,
  payload: Schema.Unknown,
  target: Schema.Unknown,
  apply: (payload: unknown) => payload,
});

/**
 * Custom operation definition for testing operation kind preservation.
 */
const CustomOpDefinition = OperationDefinition.make({
  kind: "custom.operation" as const,
  payload: Schema.Unknown,
  target: Schema.Unknown,
  apply: (payload: unknown) => payload,
});

// =============================================================================
// Categories
// =============================================================================

export const Categories = {
  BasicOperations: "Basic Operations",
  VersionFiltering: "Version Filtering",
  OrderingGuarantees: "Ordering Guarantees",
  TruncationEdgeCases: "Truncation Edge Cases",
  WalEntryIntegrity: "WAL Entry Integrity",
  DocumentIsolation: "Document Isolation",
  LargeScaleOperations: "Large-Scale Operations",
  DocumentIdEdgeCases: "Document ID Edge Cases",
  GapChecking: "Gap Checking",
  TransactionEncoding: "Transaction Encoding",
} as const;

// =============================================================================
// Helper Functions
// =============================================================================

const makeEntry = (version: number, timestamp?: number): WalEntry => ({
  transaction: Transaction.make([]),
  version,
  timestamp: timestamp ?? Date.now(),
});

const makeEntryWithData = (
  version: number,
  data: unknown,
  timestamp?: number
): WalEntry => ({
  transaction: Transaction.make([
    Operation.fromDefinition(OperationPath.make("data"), TestSetDefinition, data),
  ]),
  version,
  timestamp: timestamp ?? Date.now(),
});

const makeEntryWithPath = (
  version: number,
  pathString: string,
  payload: unknown,
  timestamp?: number
): WalEntry => ({
  transaction: Transaction.make([
    Operation.fromDefinition(OperationPath.make(pathString), TestSetDefinition, payload),
  ]),
  version,
  timestamp: timestamp ?? Date.now(),
});

// =============================================================================
// Test Definitions
// =============================================================================

const tests: StorageTestCase<HotStorageTestError, HotStorageTag>[] = [
  // ---------------------------------------------------------------------------
  // Basic Operations
  // ---------------------------------------------------------------------------
  {
    name: "getEntries returns empty array for non-existent document",
    category: Categories.BasicOperations,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      const result = yield* storage.getEntries("non-existent-hot-doc", 0);
      yield* assertEmpty(result, "Should return empty array for non-existent document");
    }),
  },

  {
    name: "append then getEntries returns the entry",
    category: Categories.BasicOperations,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      const entry = makeEntry(1);
      yield* storage.append("basic-append", entry);
      const entries = yield* storage.getEntries("basic-append", 0);
      yield* assertLength(entries, 1, "Should have one entry");
      yield* assertEqual(entries[0]!.version, 1, "Entry version should match");
    }),
  },

  {
    name: "multiple append calls accumulate entries",
    category: Categories.BasicOperations,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      yield* storage.append("multi-append", makeEntry(1));
      yield* storage.append("multi-append", makeEntry(2));
      yield* storage.append("multi-append", makeEntry(3));
      const entries = yield* storage.getEntries("multi-append", 0);
      yield* assertLength(entries, 3, "Should have three entries");
    }),
  },

  {
    name: "truncate removes entries with version <= upToVersion",
    category: Categories.BasicOperations,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      yield* storage.append("truncate-basic", makeEntry(1));
      yield* storage.append("truncate-basic", makeEntry(2));
      yield* storage.append("truncate-basic", makeEntry(3));
      yield* storage.truncate("truncate-basic", 2);
      const entries = yield* storage.getEntries("truncate-basic", 0);
      yield* assertLength(entries, 1, "Should have one entry after truncate");
      yield* assertEqual(entries[0]!.version, 3, "Only version 3 should remain");
    }),
  },

  {
    name: "truncate on non-existent document does not error",
    category: Categories.BasicOperations,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      yield* storage.truncate("non-existent-truncate", 100);
    }),
  },

  // ---------------------------------------------------------------------------
  // Version Filtering (Critical for Recovery)
  // ---------------------------------------------------------------------------
  {
    name: "getEntries(doc, 0) returns all entries",
    category: Categories.VersionFiltering,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      yield* storage.append("filter-all", makeEntry(1));
      yield* storage.append("filter-all", makeEntry(2));
      yield* storage.append("filter-all", makeEntry(3));
      const entries = yield* storage.getEntries("filter-all", 0);
      yield* assertLength(entries, 3, "sinceVersion=0 should return all entries");
    }),
  },

  {
    name: "getEntries(doc, n) returns only entries with version > n",
    category: Categories.VersionFiltering,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      yield* storage.append("filter-n", makeEntry(1));
      yield* storage.append("filter-n", makeEntry(2));
      yield* storage.append("filter-n", makeEntry(3));
      yield* storage.append("filter-n", makeEntry(4));
      const entries = yield* storage.getEntries("filter-n", 2);
      yield* assertLength(entries, 2, "Should return entries with version > 2");
      yield* assertEqual(entries[0]!.version, 3, "First entry should be version 3");
      yield* assertEqual(entries[1]!.version, 4, "Second entry should be version 4");
    }),
  },

  {
    name: "getEntries(doc, exactVersion) excludes that exact version",
    category: Categories.VersionFiltering,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      yield* storage.append("filter-exact", makeEntry(5));
      yield* storage.append("filter-exact", makeEntry(6));
      yield* storage.append("filter-exact", makeEntry(7));
      const entries = yield* storage.getEntries("filter-exact", 6);
      yield* assertLength(entries, 1, "Should exclude version 6");
      yield* assertEqual(entries[0]!.version, 7, "Only version 7 should be returned");
    }),
  },

  {
    name: "getEntries(doc, maxVersion) returns empty array",
    category: Categories.VersionFiltering,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      yield* storage.append("filter-max", makeEntry(1));
      yield* storage.append("filter-max", makeEntry(2));
      yield* storage.append("filter-max", makeEntry(3));
      const entries = yield* storage.getEntries("filter-max", 3);
      yield* assertEmpty(entries, "sinceVersion >= maxVersion should return empty");
    }),
  },

  {
    name: "getEntries(doc, MAX_SAFE_INTEGER) returns empty array",
    category: Categories.VersionFiltering,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      yield* storage.append("filter-huge", makeEntry(1));
      yield* storage.append("filter-huge", makeEntry(1000000));
      const entries = yield* storage.getEntries("filter-huge", Number.MAX_SAFE_INTEGER);
      yield* assertEmpty(entries, "sinceVersion=MAX_SAFE_INTEGER should return empty");
    }),
  },

  // ---------------------------------------------------------------------------
  // Ordering Guarantees
  // ---------------------------------------------------------------------------
  {
    name: "entries returned sorted by version ascending",
    category: Categories.OrderingGuarantees,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      yield* storage.append("order-test", makeEntry(1));
      yield* storage.append("order-test", makeEntry(2));
      yield* storage.append("order-test", makeEntry(3));
      const entries = yield* storage.getEntries("order-test", 0);
      yield* assertSortedBy(entries, "version", "Entries should be sorted by version");
    }),
  },

  {
    name: "out-of-order appends are sorted correctly on retrieval",
    category: Categories.OrderingGuarantees,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      yield* storage.append("ooo-test", makeEntry(3));
      yield* storage.append("ooo-test", makeEntry(1));
      yield* storage.append("ooo-test", makeEntry(4));
      yield* storage.append("ooo-test", makeEntry(2));
      const entries = yield* storage.getEntries("ooo-test", 0);
      yield* assertLength(entries, 4, "Should have all 4 entries");
      yield* assertEqual(entries[0]!.version, 1, "First should be version 1");
      yield* assertEqual(entries[1]!.version, 2, "Second should be version 2");
      yield* assertEqual(entries[2]!.version, 3, "Third should be version 3");
      yield* assertEqual(entries[3]!.version, 4, "Fourth should be version 4");
    }),
  },

  // ---------------------------------------------------------------------------
  // Truncation Edge Cases
  // ---------------------------------------------------------------------------
  {
    name: "truncate(doc, 0) removes nothing (versions > 0 kept)",
    category: Categories.TruncationEdgeCases,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      yield* storage.append("trunc-0", makeEntry(1));
      yield* storage.append("trunc-0", makeEntry(2));
      yield* storage.truncate("trunc-0", 0);
      const entries = yield* storage.getEntries("trunc-0", 0);
      yield* assertLength(entries, 2, "truncate(0) should keep all entries with version > 0");
    }),
  },

  {
    name: "truncate(doc, maxVersion) removes all entries",
    category: Categories.TruncationEdgeCases,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      yield* storage.append("trunc-all", makeEntry(1));
      yield* storage.append("trunc-all", makeEntry(2));
      yield* storage.append("trunc-all", makeEntry(3));
      yield* storage.truncate("trunc-all", 3);
      const entries = yield* storage.getEntries("trunc-all", 0);
      yield* assertEmpty(entries, "truncate(maxVersion) should remove all entries");
    }),
  },

  {
    name: "truncate(doc, middleVersion) removes correct entries",
    category: Categories.TruncationEdgeCases,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      yield* storage.append("trunc-mid", makeEntry(1));
      yield* storage.append("trunc-mid", makeEntry(2));
      yield* storage.append("trunc-mid", makeEntry(3));
      yield* storage.append("trunc-mid", makeEntry(4));
      yield* storage.append("trunc-mid", makeEntry(5));
      yield* storage.truncate("trunc-mid", 3);
      const entries = yield* storage.getEntries("trunc-mid", 0);
      yield* assertLength(entries, 2, "Should keep versions 4 and 5");
      yield* assertEqual(entries[0]!.version, 4, "First remaining should be 4");
      yield* assertEqual(entries[1]!.version, 5, "Second remaining should be 5");
    }),
  },

  {
    name: "multiple truncates work correctly",
    category: Categories.TruncationEdgeCases,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      yield* storage.append("multi-trunc", makeEntry(1));
      yield* storage.append("multi-trunc", makeEntry(2));
      yield* storage.append("multi-trunc", makeEntry(3));
      yield* storage.append("multi-trunc", makeEntry(4));
      yield* storage.append("multi-trunc", makeEntry(5));
      yield* storage.truncate("multi-trunc", 2);
      yield* storage.truncate("multi-trunc", 4);
      const entries = yield* storage.getEntries("multi-trunc", 0);
      yield* assertLength(entries, 1, "Should only have version 5");
      yield* assertEqual(entries[0]!.version, 5, "Only version 5 should remain");
    }),
  },

  {
    name: "truncate followed by append works correctly",
    category: Categories.TruncationEdgeCases,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      yield* storage.append("trunc-append", makeEntry(1));
      yield* storage.append("trunc-append", makeEntry(2));
      yield* storage.truncate("trunc-append", 2);
      yield* storage.append("trunc-append", makeEntry(3));
      yield* storage.append("trunc-append", makeEntry(4));
      const entries = yield* storage.getEntries("trunc-append", 0);
      yield* assertLength(entries, 2, "Should have versions 3 and 4");
      yield* assertEqual(entries[0]!.version, 3, "First should be 3");
      yield* assertEqual(entries[1]!.version, 4, "Second should be 4");
    }),
  },

  // ---------------------------------------------------------------------------
  // WAL Entry Data Integrity
  // ---------------------------------------------------------------------------
  {
    name: "transaction data is preserved exactly",
    category: Categories.WalEntryIntegrity,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      const entry = makeEntryWithData(1, { key: "value", nested: { a: 1 } });
      yield* storage.append("tx-data", entry);
      const entries = yield* storage.getEntries("tx-data", 0);
      yield* assertLength(entries, 1, "Should have one entry");
      yield* assertEqual(
        entries[0]!.transaction,
        entry.transaction,
        "Transaction should be preserved exactly"
      );
    }),
  },

  {
    name: "version number is preserved exactly",
    category: Categories.WalEntryIntegrity,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      const version = 42;
      const entry = makeEntry(version);
      yield* storage.append("version-preserve", entry);
      const entries = yield* storage.getEntries("version-preserve", 0);
      yield* assertEqual(entries[0]!.version, version, "Version should be preserved exactly");
    }),
  },

  {
    name: "timestamp is preserved exactly",
    category: Categories.WalEntryIntegrity,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      const timestamp = 1704067200000;
      const entry = makeEntry(1, timestamp);
      yield* storage.append("timestamp-preserve", entry);
      const entries = yield* storage.getEntries("timestamp-preserve", 0);
      yield* assertEqual(
        entries[0]!.timestamp,
        timestamp,
        "Timestamp should be preserved exactly"
      );
    }),
  },

  {
    name: "complex transaction operations survive roundtrip",
    category: Categories.WalEntryIntegrity,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      const entry: WalEntry = {
        transaction: Transaction.make([
          { type: "set", path: ["a"], value: 1 },
          { type: "set", path: ["b", "c"], value: "nested" },
          { type: "set", path: ["arr"], value: [1, 2, 3] },
        ]),
        version: 1,
        timestamp: Date.now(),
      };
      yield* storage.append("complex-tx", entry);
      const entries = yield* storage.getEntries("complex-tx", 0);
      yield* assertEqual(
        entries[0]!.transaction,
        entry.transaction,
        "Complex transaction should survive roundtrip"
      );
    }),
  },

  // ---------------------------------------------------------------------------
  // Document Isolation
  // ---------------------------------------------------------------------------
  {
    name: "different documents have independent entry lists",
    category: Categories.DocumentIsolation,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      yield* storage.append("iso-hot-1", makeEntry(1));
      yield* storage.append("iso-hot-1", makeEntry(2));
      yield* storage.append("iso-hot-2", makeEntry(10));
      const entries1 = yield* storage.getEntries("iso-hot-1", 0);
      const entries2 = yield* storage.getEntries("iso-hot-2", 0);
      yield* assertLength(entries1, 2, "Doc 1 should have 2 entries");
      yield* assertLength(entries2, 1, "Doc 2 should have 1 entry");
      yield* assertEqual(entries1[0]!.version, 1, "Doc 1 first entry version");
      yield* assertEqual(entries2[0]!.version, 10, "Doc 2 first entry version");
    }),
  },

  {
    name: "appending to one doc does not affect others",
    category: Categories.DocumentIsolation,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      yield* storage.append("append-iso-1", makeEntry(1));
      const beforeAppend = yield* storage.getEntries("append-iso-1", 0);
      yield* storage.append("append-iso-2", makeEntry(100));
      yield* storage.append("append-iso-2", makeEntry(101));
      const afterAppend = yield* storage.getEntries("append-iso-1", 0);
      yield* assertEqual(
        beforeAppend.length,
        afterAppend.length,
        "Appending to doc 2 should not affect doc 1"
      );
    }),
  },

  {
    name: "truncating one doc does not affect others",
    category: Categories.DocumentIsolation,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      yield* storage.append("trunc-iso-1", makeEntry(1));
      yield* storage.append("trunc-iso-1", makeEntry(2));
      yield* storage.append("trunc-iso-2", makeEntry(1));
      yield* storage.append("trunc-iso-2", makeEntry(2));
      yield* storage.truncate("trunc-iso-1", 2);
      const entries1 = yield* storage.getEntries("trunc-iso-1", 0);
      const entries2 = yield* storage.getEntries("trunc-iso-2", 0);
      yield* assertEmpty(entries1, "Doc 1 should be empty after truncate");
      yield* assertLength(entries2, 2, "Doc 2 should still have 2 entries");
    }),
  },

  // ---------------------------------------------------------------------------
  // Large-Scale Operations
  // ---------------------------------------------------------------------------
  {
    name: "handle 1000+ entries per document",
    category: Categories.LargeScaleOperations,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      const count = 1000;
      for (let i = 1; i <= count; i++) {
        yield* storage.append("large-entries", makeEntry(i));
      }
      const entries = yield* storage.getEntries("large-entries", 0);
      yield* assertLength(entries, count, `Should have ${count} entries`);
      yield* assertSortedBy(entries, "version", "Should be sorted by version");
      yield* assertEqual(entries[0]!.version, 1, "First should be version 1");
      yield* assertEqual(entries[count - 1]!.version, count, `Last should be version ${count}`);
    }),
  },

  {
    name: "handle 100+ documents",
    category: Categories.LargeScaleOperations,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      const docCount = 100;
      for (let i = 0; i < docCount; i++) {
        yield* storage.append(`multi-doc-${i}`, makeEntry(1));
        yield* storage.append(`multi-doc-${i}`, makeEntry(2));
      }
      let totalEntries = 0;
      for (let i = 0; i < docCount; i++) {
        const entries = yield* storage.getEntries(`multi-doc-${i}`, 0);
        totalEntries += entries.length;
        yield* assertLength(entries, 2, `Doc ${i} should have 2 entries`);
      }
      yield* assertEqual(totalEntries, docCount * 2, "Total entries should match");
    }),
  },

  {
    name: "large transaction data (10KB+) survives roundtrip",
    category: Categories.LargeScaleOperations,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      const largeData = "x".repeat(10 * 1024);
      const entry = makeEntryWithData(1, { content: largeData });
      yield* storage.append("large-tx", entry);
      const entries = yield* storage.getEntries("large-tx", 0);
      yield* assertLength(entries, 1, "Should have one entry");
      yield* assertEqual(
        entries[0]!.transaction,
        entry.transaction,
        "Large transaction data should survive roundtrip"
      );
    }),
  },

  // ---------------------------------------------------------------------------
  // Document ID Edge Cases
  // ---------------------------------------------------------------------------
  {
    name: "long documentId (1000+ chars) works",
    category: Categories.DocumentIdEdgeCases,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      const longId = "h".repeat(1000);
      const entry = makeEntry(1);
      yield* storage.append(longId, entry);
      const entries = yield* storage.getEntries(longId, 0);
      yield* assertLength(entries, 1, "Long documentId should work");
    }),
  },

  {
    name: "unicode documentId works",
    category: Categories.DocumentIdEdgeCases,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      const unicodeId = "hot-doc-id";
      const entry = makeEntry(1);
      yield* storage.append(unicodeId, entry);
      const entries = yield* storage.getEntries(unicodeId, 0);
      yield* assertLength(entries, 1, "Unicode documentId should work");
    }),
  },

  {
    name: "documentId with special chars works",
    category: Categories.DocumentIdEdgeCases,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      const specialId = "hot/path:to.wal";
      const entry = makeEntry(1);
      yield* storage.append(specialId, entry);
      const entries = yield* storage.getEntries(specialId, 0);
      yield* assertLength(entries, 1, "DocumentId with special chars should work");
    }),
  },

  {
    name: "documentId with spaces works",
    category: Categories.DocumentIdEdgeCases,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      const spacedId = "hot doc with spaces";
      const entry = makeEntry(1);
      yield* storage.append(spacedId, entry);
      const entries = yield* storage.getEntries(spacedId, 0);
      yield* assertLength(entries, 1, "DocumentId with spaces should work");
    }),
  },

  {
    name: "version 0 entry is handled correctly",
    category: Categories.VersionFiltering,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      yield* storage.append("version-0-entry", makeEntry(0));
      yield* storage.append("version-0-entry", makeEntry(1));
      const entriesFromNeg = yield* storage.getEntries("version-0-entry", -1);
      yield* assertTrue(
        entriesFromNeg.some((e) => e.version === 0),
        "Version 0 entry should be retrievable with sinceVersion < 0"
      );
      const entriesFrom0 = yield* storage.getEntries("version-0-entry", 0);
      yield* assertTrue(
        !entriesFrom0.some((e) => e.version === 0),
        "Version 0 entry should be excluded with sinceVersion = 0"
      );
    }),
  },

  // ---------------------------------------------------------------------------
  // Gap Checking (appendWithCheck)
  // ---------------------------------------------------------------------------
  {
    name: "appendWithCheck succeeds for first entry (expectedVersion=1)",
    category: Categories.GapChecking,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      const entry = makeEntry(1);
      yield* storage.appendWithCheck("gap-check-first", entry, 1);
      const entries = yield* storage.getEntries("gap-check-first", 0);
      yield* assertLength(entries, 1, "Should have one entry");
      yield* assertEqual(entries[0]!.version, 1, "Entry version should be 1");
    }),
  },

  {
    name: "appendWithCheck succeeds for consecutive versions",
    category: Categories.GapChecking,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      yield* storage.appendWithCheck("gap-check-consecutive", makeEntry(1), 1);
      yield* storage.appendWithCheck("gap-check-consecutive", makeEntry(2), 2);
      yield* storage.appendWithCheck("gap-check-consecutive", makeEntry(3), 3);
      const entries = yield* storage.getEntries("gap-check-consecutive", 0);
      yield* assertLength(entries, 3, "Should have three entries");
      yield* assertEqual(entries[0]!.version, 1, "First entry version should be 1");
      yield* assertEqual(entries[1]!.version, 2, "Second entry version should be 2");
      yield* assertEqual(entries[2]!.version, 3, "Third entry version should be 3");
    }),
  },

  {
    name: "appendWithCheck fails for version gap (skipping version 2)",
    category: Categories.GapChecking,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      yield* storage.appendWithCheck("gap-check-fail", makeEntry(1), 1);
      // Attempt to append version 3, skipping version 2
      const result = yield* Effect.either(
        storage.appendWithCheck("gap-check-fail", makeEntry(3), 3)
      );
      yield* assertTrue(
        result._tag === "Left",
        "appendWithCheck should fail when there's a version gap"
      );
      if (result._tag === "Left") {
        yield* assertTrue(
          result.left._tag === "WalVersionGapError",
          "Error should be WalVersionGapError"
        );
      }
      // Verify version 3 was not appended
      const entries = yield* storage.getEntries("gap-check-fail", 0);
      yield* assertLength(entries, 1, "Should only have version 1");
      yield* assertEqual(entries[0]!.version, 1, "Only version 1 should exist");
    }),
  },

  {
    name: "appendWithCheck fails if first entry is not version 1",
    category: Categories.GapChecking,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      // Attempt to append version 2 as first entry (expecting gap error)
      const result = yield* Effect.either(
        storage.appendWithCheck("gap-check-not-first", makeEntry(2), 2)
      );
      yield* assertTrue(
        result._tag === "Left",
        "appendWithCheck should fail when first entry is not version 1"
      );
      if (result._tag === "Left") {
        yield* assertTrue(
          result.left._tag === "WalVersionGapError",
          "Error should be WalVersionGapError"
        );
      }
      // Verify nothing was appended
      const entries = yield* storage.getEntries("gap-check-not-first", 0);
      yield* assertEmpty(entries, "No entries should exist after failed append");
    }),
  },

  {
    name: "appendWithCheck fails when entry already exists at expectedVersion",
    category: Categories.GapChecking,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      yield* storage.appendWithCheck("gap-check-duplicate", makeEntry(1), 1);
      // Attempt to append another version 1
      const result = yield* Effect.either(
        storage.appendWithCheck("gap-check-duplicate", makeEntry(1), 1)
      );
      yield* assertTrue(
        result._tag === "Left",
        "appendWithCheck should fail when version already exists"
      );
      // Verify still only one entry
      const entries = yield* storage.getEntries("gap-check-duplicate", 0);
      yield* assertLength(entries, 1, "Should still only have one entry");
    }),
  },

  {
    name: "appendWithCheck after truncate works correctly",
    category: Categories.GapChecking,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      // Append versions 1, 2, 3
      yield* storage.appendWithCheck("gap-check-truncate", makeEntry(1), 1);
      yield* storage.appendWithCheck("gap-check-truncate", makeEntry(2), 2);
      yield* storage.appendWithCheck("gap-check-truncate", makeEntry(3), 3);
      // Truncate up to version 2
      yield* storage.truncate("gap-check-truncate", 2);
      // Now append version 4 (should succeed since last entry is version 3)
      yield* storage.appendWithCheck("gap-check-truncate", makeEntry(4), 4);
      const entries = yield* storage.getEntries("gap-check-truncate", 0);
      yield* assertLength(entries, 2, "Should have versions 3 and 4");
      yield* assertEqual(entries[0]!.version, 3, "First should be version 3");
      yield* assertEqual(entries[1]!.version, 4, "Second should be version 4");
    }),
  },

  // ---------------------------------------------------------------------------
  // Transaction Encoding (Critical for OperationPath preservation)
  // ---------------------------------------------------------------------------
  {
    name: "OperationPath has _tag after roundtrip",
    category: Categories.TransactionEncoding,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      const entry = makeEntryWithPath(1, "users/0/name", "Alice");
      yield* storage.append("op-path-tag", entry);
      const entries = yield* storage.getEntries("op-path-tag", 0);
      yield* assertLength(entries, 1, "Should have one entry");
      const op = entries[0]!.transaction.ops[0]!;
      yield* assertTrue(
        op.path._tag === "OperationPath",
        "path should have _tag 'OperationPath'"
      );
    }),
  },

  {
    name: "OperationPath.toTokens() works after roundtrip",
    category: Categories.TransactionEncoding,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      const entry = makeEntryWithPath(1, "users/0/name", "Alice");
      yield* storage.append("op-path-tokens", entry);
      const entries = yield* storage.getEntries("op-path-tokens", 0);
      yield* assertLength(entries, 1, "Should have one entry");
      const op = entries[0]!.transaction.ops[0]!;
      yield* assertTrue(
        typeof op.path.toTokens === "function",
        "path.toTokens should be a function"
      );
      const tokens = op.path.toTokens();
      yield* assertEqual(
        tokens,
        ["users", "0", "name"],
        "toTokens() should return correct path tokens"
      );
    }),
  },

  {
    name: "OperationPath.concat() works after roundtrip",
    category: Categories.TransactionEncoding,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      const entry = makeEntryWithPath(1, "users/0", { name: "Alice" });
      yield* storage.append("op-path-concat", entry);
      const entries = yield* storage.getEntries("op-path-concat", 0);
      yield* assertLength(entries, 1, "Should have one entry");
      const op = entries[0]!.transaction.ops[0]!;
      yield* assertTrue(
        typeof op.path.concat === "function",
        "path.concat should be a function"
      );
      const extended = op.path.concat(OperationPath.make("name"));
      yield* assertEqual(
        extended.toTokens(),
        ["users", "0", "name"],
        "concat() should work correctly"
      );
    }),
  },

  {
    name: "OperationPath.append() works after roundtrip",
    category: Categories.TransactionEncoding,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      const entry = makeEntryWithPath(1, "users", []);
      yield* storage.append("op-path-append", entry);
      const entries = yield* storage.getEntries("op-path-append", 0);
      yield* assertLength(entries, 1, "Should have one entry");
      const op = entries[0]!.transaction.ops[0]!;
      yield* assertTrue(
        typeof op.path.append === "function",
        "path.append should be a function"
      );
      const extended = op.path.append("0");
      yield* assertEqual(
        extended.toTokens(),
        ["users", "0"],
        "append() should work correctly"
      );
    }),
  },

  {
    name: "OperationPath.pop() works after roundtrip",
    category: Categories.TransactionEncoding,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      const entry = makeEntryWithPath(1, "users/0/name", "Alice");
      yield* storage.append("op-path-pop", entry);
      const entries = yield* storage.getEntries("op-path-pop", 0);
      yield* assertLength(entries, 1, "Should have one entry");
      const op = entries[0]!.transaction.ops[0]!;
      yield* assertTrue(
        typeof op.path.pop === "function",
        "path.pop should be a function"
      );
      const popped = op.path.pop();
      yield* assertEqual(
        popped.toTokens(),
        ["users", "0"],
        "pop() should remove last token"
      );
    }),
  },

  {
    name: "OperationPath.shift() works after roundtrip",
    category: Categories.TransactionEncoding,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      const entry = makeEntryWithPath(1, "users/0/name", "Alice");
      yield* storage.append("op-path-shift", entry);
      const entries = yield* storage.getEntries("op-path-shift", 0);
      yield* assertLength(entries, 1, "Should have one entry");
      const op = entries[0]!.transaction.ops[0]!;
      yield* assertTrue(
        typeof op.path.shift === "function",
        "path.shift should be a function"
      );
      const shifted = op.path.shift();
      yield* assertEqual(
        shifted.toTokens(),
        ["0", "name"],
        "shift() should remove first token"
      );
    }),
  },

  {
    name: "transaction with multiple operations preserves all OperationPaths",
    category: Categories.TransactionEncoding,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      const entry: WalEntry = {
        transaction: Transaction.make([
          Operation.fromDefinition(OperationPath.make("users/0/name"), TestSetDefinition, "Alice"),
          Operation.fromDefinition(OperationPath.make("users/1/name"), TestSetDefinition, "Bob"),
          Operation.fromDefinition(OperationPath.make("count"), TestSetDefinition, 2),
        ]),
        version: 1,
        timestamp: Date.now(),
      };
      yield* storage.append("multi-op-paths", entry);
      const entries = yield* storage.getEntries("multi-op-paths", 0);
      yield* assertLength(entries, 1, "Should have one entry");
      const ops = entries[0]!.transaction.ops;
      yield* assertLength([...ops], 3, "Should have 3 operations");
      // Verify all paths have working methods
      for (const op of ops) {
        yield* assertTrue(
          op.path._tag === "OperationPath",
          "Each operation path should have _tag"
        );
        yield* assertTrue(
          typeof op.path.toTokens === "function",
          "Each operation path should have toTokens method"
        );
      }
      yield* assertEqual(
        ops[0]!.path.toTokens(),
        ["users", "0", "name"],
        "First path should be correct"
      );
      yield* assertEqual(
        ops[1]!.path.toTokens(),
        ["users", "1", "name"],
        "Second path should be correct"
      );
      yield* assertEqual(
        ops[2]!.path.toTokens(),
        ["count"],
        "Third path should be correct"
      );
    }),
  },

  {
    name: "nested path with many segments survives roundtrip",
    category: Categories.TransactionEncoding,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      const deepPath = "level1/level2/level3/level4/level5";
      const entry = makeEntryWithPath(1, deepPath, "deep value");
      yield* storage.append("deep-path", entry);
      const entries = yield* storage.getEntries("deep-path", 0);
      yield* assertLength(entries, 1, "Should have one entry");
      const op = entries[0]!.transaction.ops[0]!;
      yield* assertEqual(
        op.path.toTokens(),
        ["level1", "level2", "level3", "level4", "level5"],
        "Deep nested path should survive roundtrip"
      );
    }),
  },

  {
    name: "empty path survives roundtrip",
    category: Categories.TransactionEncoding,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      const entry = makeEntryWithPath(1, "", { root: true });
      yield* storage.append("empty-path", entry);
      const entries = yield* storage.getEntries("empty-path", 0);
      yield* assertLength(entries, 1, "Should have one entry");
      const op = entries[0]!.transaction.ops[0]!;
      yield* assertTrue(
        op.path._tag === "OperationPath",
        "Empty path should still be OperationPath"
      );
      yield* assertTrue(
        typeof op.path.toTokens === "function",
        "Empty path should have toTokens method"
      );
    }),
  },

  {
    name: "transaction id is preserved after roundtrip",
    category: Categories.TransactionEncoding,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      const entry = makeEntryWithPath(1, "test", "value");
      const originalId = entry.transaction.id;
      yield* storage.append("tx-id-preserve", entry);
      const entries = yield* storage.getEntries("tx-id-preserve", 0);
      yield* assertLength(entries, 1, "Should have one entry");
      yield* assertEqual(
        entries[0]!.transaction.id,
        originalId,
        "Transaction id should be preserved"
      );
    }),
  },

  {
    name: "transaction timestamp is preserved after roundtrip",
    category: Categories.TransactionEncoding,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      const entry = makeEntryWithPath(1, "test", "value");
      const originalTimestamp = entry.transaction.timestamp;
      yield* storage.append("tx-timestamp-preserve", entry);
      const entries = yield* storage.getEntries("tx-timestamp-preserve", 0);
      yield* assertLength(entries, 1, "Should have one entry");
      yield* assertEqual(
        entries[0]!.transaction.timestamp,
        originalTimestamp,
        "Transaction timestamp should be preserved"
      );
    }),
  },

  {
    name: "operation kind is preserved after roundtrip",
    category: Categories.TransactionEncoding,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      const entry: WalEntry = {
        transaction: Transaction.make([
          Operation.fromDefinition(OperationPath.make("data"), CustomOpDefinition, "test"),
        ]),
        version: 1,
        timestamp: Date.now(),
      };
      yield* storage.append("op-kind-preserve", entry);
      const entries = yield* storage.getEntries("op-kind-preserve", 0);
      yield* assertLength(entries, 1, "Should have one entry");
      yield* assertEqual(
        entries[0]!.transaction.ops[0]!.kind,
        "custom.operation",
        "Operation kind should be preserved"
      );
    }),
  },

  {
    name: "operation payload with complex object survives roundtrip",
    category: Categories.TransactionEncoding,
    run: Effect.gen(function* () {
      const storage = yield* HotStorageTag;
      const complexPayload = {
        nested: { value: 42, array: [1, 2, 3] },
        nullValue: null,
        string: "test",
      };
      const entry = makeEntryWithPath(1, "data", complexPayload);
      yield* storage.append("complex-payload", entry);
      const entries = yield* storage.getEntries("complex-payload", 0);
      yield* assertLength(entries, 1, "Should have one entry");
      yield* assertEqual(
        entries[0]!.transaction.ops[0]!.payload,
        complexPayload,
        "Complex payload should survive roundtrip"
      );
    }),
  },
];

// =============================================================================
// Exports
// =============================================================================

/**
 * Get all HotStorage test cases.
 *
 * @returns Array of test cases that require HotStorageTag
 */
export const makeTests = (): StorageTestCase<
  HotStorageTestError,
  HotStorageTag
>[] => tests;

/**
 * Run all tests and collect results.
 *
 * @returns Effect that produces TestResults
 */
export const runAll = (): Effect.Effect<
  TestResults<HotStorageTestError, HotStorageTag>,
  never,
  HotStorageTag
> =>
  Effect.gen(function* () {
    const passed: StorageTestCase<HotStorageTestError, HotStorageTag>[] = [];
    const failed: Array<{
      test: StorageTestCase<HotStorageTestError, HotStorageTag>;
      error: HotStorageTestError;
    }> = [];

    for (const test of tests) {
      const result = yield* Effect.either(test.run);
      if (result._tag === "Right") {
        passed.push(test);
      } else {
        failed.push({ test, error: result.left });
      }
    }

    return {
      passed,
      failed,
      total: tests.length,
      passCount: passed.length,
      failCount: failed.length,
    };
  });

export const HotStorageTestSuite = {
  Categories,
  makeTests,
  runAll,
};
