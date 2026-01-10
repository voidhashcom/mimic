/**
 * @voidhash/mimic-effect/testing - ColdStorage Test Suite
 *
 * Comprehensive test suite for ColdStorage adapter implementations.
 * These tests verify that an adapter correctly implements the ColdStorage interface
 * and can reliably store/retrieve document snapshots without data loss.
 */
import { Effect } from "effect";
import { ColdStorageTag } from "../ColdStorage";
import type { ColdStorageError } from "../Errors";
import type { StoredDocument } from "../Types";
import type { StorageTestCase, TestResults } from "./types";
import { TestError } from "./types";
import {
  assertEqual,
  assertUndefined,
  assertDefined,
} from "./assertions";

/**
 * Error type for ColdStorage tests - can be either a TestError or a ColdStorageError
 */
export type ColdStorageTestError = TestError | ColdStorageError;

// =============================================================================
// Categories
// =============================================================================

export const Categories = {
  BasicOperations: "Basic Operations",
  DataIntegrity: "Data Integrity",
  VersionHandling: "Version Handling",
  TimestampHandling: "Timestamp Handling",
  DocumentIdEdgeCases: "Document ID Edge Cases",
  DocumentIsolation: "Document Isolation",
  ConsistencyGuarantees: "Consistency Guarantees",
} as const;

// =============================================================================
// Helper Functions
// =============================================================================

const makeDoc = (overrides: Partial<StoredDocument> = {}): StoredDocument => ({
  state: { title: "Test Document" },
  version: 1,
  schemaVersion: 1,
  savedAt: Date.now(),
  ...overrides,
});

const generateLargeState = (sizeKB: number): Record<string, unknown> => {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const targetBytes = sizeKB * 1024;
  let content = "";
  while (content.length < targetBytes) {
    content += chars[Math.floor(Math.random() * chars.length)];
  }
  return { content, padding: Array(100).fill("x") };
};

// =============================================================================
// Test Definitions
// =============================================================================

const tests: StorageTestCase<ColdStorageTestError, ColdStorageTag>[] = [
  // ---------------------------------------------------------------------------
  // Basic Operations
  // ---------------------------------------------------------------------------
  {
    name: "load returns undefined for non-existent document",
    category: Categories.BasicOperations,
    run: Effect.gen(function* () {
      const storage = yield* ColdStorageTag;
      const result = yield* storage.load("non-existent-doc-id-12345");
      yield* assertUndefined(result, "Expected undefined for non-existent document");
    }),
  },

  {
    name: "save then load returns exact same document",
    category: Categories.BasicOperations,
    run: Effect.gen(function* () {
      const storage = yield* ColdStorageTag;
      const doc = makeDoc();
      yield* storage.save("test-doc-1", doc);
      const loaded = yield* storage.load("test-doc-1");
      yield* assertEqual(loaded, doc, "Loaded document should match saved document");
    }),
  },

  {
    name: "save overwrites existing document",
    category: Categories.BasicOperations,
    run: Effect.gen(function* () {
      const storage = yield* ColdStorageTag;
      const doc1 = makeDoc({ state: { title: "First" }, version: 1 });
      const doc2 = makeDoc({ state: { title: "Second" }, version: 2 });
      yield* storage.save("test-doc-2", doc1);
      yield* storage.save("test-doc-2", doc2);
      const loaded = yield* storage.load("test-doc-2");
      yield* assertEqual(loaded, doc2, "Should return the second (overwritten) document");
    }),
  },

  {
    name: "delete removes document",
    category: Categories.BasicOperations,
    run: Effect.gen(function* () {
      const storage = yield* ColdStorageTag;
      const doc = makeDoc();
      yield* storage.save("test-doc-3", doc);
      yield* storage.delete("test-doc-3");
      const loaded = yield* storage.load("test-doc-3");
      yield* assertUndefined(loaded, "Document should be undefined after deletion");
    }),
  },

  {
    name: "delete on non-existent document does not error",
    category: Categories.BasicOperations,
    run: Effect.gen(function* () {
      const storage = yield* ColdStorageTag;
      yield* storage.delete("definitely-non-existent-doc-xyz");
    }),
  },

  // ---------------------------------------------------------------------------
  // Data Integrity & Serialization
  // ---------------------------------------------------------------------------
  {
    name: "all StoredDocument fields are preserved",
    category: Categories.DataIntegrity,
    run: Effect.gen(function* () {
      const storage = yield* ColdStorageTag;
      const doc: StoredDocument = {
        state: { nested: { value: 42 } },
        version: 123,
        schemaVersion: 2,
        savedAt: 1704067200000,
      };
      yield* storage.save("fields-test", doc);
      const loaded = yield* storage.load("fields-test");
      const definedLoaded = yield* assertDefined(loaded, "Document should exist");
      yield* assertEqual(definedLoaded.state, doc.state, "state should be preserved");
      yield* assertEqual(definedLoaded.version, doc.version, "version should be preserved");
      yield* assertEqual(definedLoaded.schemaVersion, doc.schemaVersion, "schemaVersion should be preserved");
      yield* assertEqual(definedLoaded.savedAt, doc.savedAt, "savedAt should be preserved");
    }),
  },

  {
    name: "complex nested state objects survive roundtrip",
    category: Categories.DataIntegrity,
    run: Effect.gen(function* () {
      const storage = yield* ColdStorageTag;
      const complexState = {
        level1: {
          level2: {
            level3: {
              value: "deep",
              array: [1, 2, { nested: true }],
            },
          },
          sibling: "value",
        },
        topLevel: 42,
      };
      const doc = makeDoc({ state: complexState });
      yield* storage.save("complex-state", doc);
      const loaded = yield* storage.load("complex-state");
      yield* assertEqual(loaded, doc, "Complex nested state should survive roundtrip");
    }),
  },

  {
    name: "arrays in state survive roundtrip",
    category: Categories.DataIntegrity,
    run: Effect.gen(function* () {
      const storage = yield* ColdStorageTag;
      const doc = makeDoc({
        state: {
          numbers: [1, 2, 3, 4, 5],
          strings: ["a", "b", "c"],
          mixed: [1, "two", { three: 3 }, [4]],
          empty: [],
        },
      });
      yield* storage.save("arrays-test", doc);
      const loaded = yield* storage.load("arrays-test");
      yield* assertEqual(loaded, doc, "Arrays should survive roundtrip");
    }),
  },

  {
    name: "null values in state survive roundtrip",
    category: Categories.DataIntegrity,
    run: Effect.gen(function* () {
      const storage = yield* ColdStorageTag;
      const doc = makeDoc({
        state: {
          nullValue: null,
          nested: { alsoNull: null },
          array: [null, 1, null],
        },
      });
      yield* storage.save("null-test", doc);
      const loaded = yield* storage.load("null-test");
      yield* assertEqual(loaded, doc, "null values should survive roundtrip");
    }),
  },

  {
    name: "empty object survives roundtrip",
    category: Categories.DataIntegrity,
    run: Effect.gen(function* () {
      const storage = yield* ColdStorageTag;
      const doc = makeDoc({ state: {} });
      yield* storage.save("empty-obj", doc);
      const loaded = yield* storage.load("empty-obj");
      yield* assertEqual(loaded, doc, "Empty object should survive roundtrip");
    }),
  },

  {
    name: "empty array survives roundtrip",
    category: Categories.DataIntegrity,
    run: Effect.gen(function* () {
      const storage = yield* ColdStorageTag;
      const doc = makeDoc({ state: [] });
      yield* storage.save("empty-arr", doc);
      const loaded = yield* storage.load("empty-arr");
      yield* assertEqual(loaded, doc, "Empty array should survive roundtrip");
    }),
  },

  {
    name: "unicode strings in state survive roundtrip",
    category: Categories.DataIntegrity,
    run: Effect.gen(function* () {
      const storage = yield* ColdStorageTag;
      const doc = makeDoc({
        state: {
          emoji: "Hello! How are you?",
          chinese: "Chinese Characters",
          arabic: "Arabic Letters",
          special: "Combined: Cafe",
        },
      });
      yield* storage.save("unicode-test", doc);
      const loaded = yield* storage.load("unicode-test");
      yield* assertEqual(loaded, doc, "Unicode strings should survive roundtrip");
    }),
  },

  {
    name: "large state objects (100KB+) survive roundtrip",
    category: Categories.DataIntegrity,
    run: Effect.gen(function* () {
      const storage = yield* ColdStorageTag;
      const largeState = generateLargeState(100);
      const doc = makeDoc({ state: largeState });
      yield* storage.save("large-doc", doc);
      const loaded = yield* storage.load("large-doc");
      yield* assertEqual(loaded, doc, "Large documents should survive roundtrip");
    }),
  },

  {
    name: "special JSON characters survive roundtrip",
    category: Categories.DataIntegrity,
    run: Effect.gen(function* () {
      const storage = yield* ColdStorageTag;
      const doc = makeDoc({
        state: {
          quotes: 'He said "hello"',
          backslash: "path\\to\\file",
          newline: "line1\nline2",
          tab: "col1\tcol2",
          mixed: 'All: "\\\n\t',
        },
      });
      yield* storage.save("special-chars", doc);
      const loaded = yield* storage.load("special-chars");
      yield* assertEqual(loaded, doc, "Special JSON characters should survive roundtrip");
    }),
  },

  // ---------------------------------------------------------------------------
  // Version Number Edge Cases
  // ---------------------------------------------------------------------------
  {
    name: "version 0 is preserved correctly",
    category: Categories.VersionHandling,
    run: Effect.gen(function* () {
      const storage = yield* ColdStorageTag;
      const doc = makeDoc({ version: 0 });
      yield* storage.save("version-0", doc);
      const loaded = yield* storage.load("version-0");
      const definedLoaded = yield* assertDefined(loaded, "Document should exist");
      yield* assertEqual(definedLoaded.version, 0, "Version 0 should be preserved");
    }),
  },

  {
    name: "version 1 is preserved correctly",
    category: Categories.VersionHandling,
    run: Effect.gen(function* () {
      const storage = yield* ColdStorageTag;
      const doc = makeDoc({ version: 1 });
      yield* storage.save("version-1", doc);
      const loaded = yield* storage.load("version-1");
      const definedLoaded = yield* assertDefined(loaded, "Document should exist");
      yield* assertEqual(definedLoaded.version, 1, "Version 1 should be preserved");
    }),
  },

  {
    name: "large version numbers are preserved",
    category: Categories.VersionHandling,
    run: Effect.gen(function* () {
      const storage = yield* ColdStorageTag;
      const largeVersion = Number.MAX_SAFE_INTEGER;
      const doc = makeDoc({ version: largeVersion });
      yield* storage.save("large-version", doc);
      const loaded = yield* storage.load("large-version");
      const definedLoaded = yield* assertDefined(loaded, "Document should exist");
      yield* assertEqual(
        definedLoaded.version,
        largeVersion,
        "Large version number should be preserved exactly"
      );
    }),
  },

  {
    name: "schema version is preserved correctly",
    category: Categories.VersionHandling,
    run: Effect.gen(function* () {
      const storage = yield* ColdStorageTag;
      const doc = makeDoc({ schemaVersion: 42 });
      yield* storage.save("schema-version", doc);
      const loaded = yield* storage.load("schema-version");
      const definedLoaded = yield* assertDefined(loaded, "Document should exist");
      yield* assertEqual(definedLoaded.schemaVersion, 42, "Schema version should be preserved");
    }),
  },

  // ---------------------------------------------------------------------------
  // Timestamp Handling
  // ---------------------------------------------------------------------------
  {
    name: "savedAt timestamp is preserved exactly",
    category: Categories.TimestampHandling,
    run: Effect.gen(function* () {
      const storage = yield* ColdStorageTag;
      const timestamp = 1704067200000;
      const doc = makeDoc({ savedAt: timestamp });
      yield* storage.save("timestamp-exact", doc);
      const loaded = yield* storage.load("timestamp-exact");
      const definedLoaded = yield* assertDefined(loaded, "Document should exist");
      yield* assertEqual(definedLoaded.savedAt, timestamp, "savedAt should be preserved exactly");
    }),
  },

  {
    name: "timestamp 0 is preserved correctly",
    category: Categories.TimestampHandling,
    run: Effect.gen(function* () {
      const storage = yield* ColdStorageTag;
      const doc = makeDoc({ savedAt: 0 });
      yield* storage.save("timestamp-0", doc);
      const loaded = yield* storage.load("timestamp-0");
      const definedLoaded = yield* assertDefined(loaded, "Document should exist");
      yield* assertEqual(definedLoaded.savedAt, 0, "Timestamp 0 should be preserved");
    }),
  },

  {
    name: "recent timestamps are preserved correctly",
    category: Categories.TimestampHandling,
    run: Effect.gen(function* () {
      const storage = yield* ColdStorageTag;
      const now = Date.now();
      const doc = makeDoc({ savedAt: now });
      yield* storage.save("timestamp-recent", doc);
      const loaded = yield* storage.load("timestamp-recent");
      const definedLoaded = yield* assertDefined(loaded, "Document should exist");
      yield* assertEqual(definedLoaded.savedAt, now, "Recent timestamp should be preserved");
    }),
  },

  // ---------------------------------------------------------------------------
  // Document ID Edge Cases
  // ---------------------------------------------------------------------------
  {
    name: "long documentId (1000+ chars) works",
    category: Categories.DocumentIdEdgeCases,
    run: Effect.gen(function* () {
      const storage = yield* ColdStorageTag;
      const longId = "x".repeat(1000);
      const doc = makeDoc();
      yield* storage.save(longId, doc);
      const loaded = yield* storage.load(longId);
      yield* assertEqual(loaded, doc, "Long documentId should work correctly");
    }),
  },

  {
    name: "unicode documentId works",
    category: Categories.DocumentIdEdgeCases,
    run: Effect.gen(function* () {
      const storage = yield* ColdStorageTag;
      const unicodeId = "doc-test-id";
      const doc = makeDoc();
      yield* storage.save(unicodeId, doc);
      const loaded = yield* storage.load(unicodeId);
      yield* assertEqual(loaded, doc, "Unicode documentId should work correctly");
    }),
  },

  {
    name: "documentId with special chars works",
    category: Categories.DocumentIdEdgeCases,
    run: Effect.gen(function* () {
      const storage = yield* ColdStorageTag;
      const specialId = "doc/path:to.file";
      const doc = makeDoc();
      yield* storage.save(specialId, doc);
      const loaded = yield* storage.load(specialId);
      yield* assertEqual(loaded, doc, "DocumentId with special chars should work");
    }),
  },

  {
    name: "documentId with spaces works",
    category: Categories.DocumentIdEdgeCases,
    run: Effect.gen(function* () {
      const storage = yield* ColdStorageTag;
      const spacedId = "doc with spaces";
      const doc = makeDoc();
      yield* storage.save(spacedId, doc);
      const loaded = yield* storage.load(spacedId);
      yield* assertEqual(loaded, doc, "DocumentId with spaces should work");
    }),
  },

  // ---------------------------------------------------------------------------
  // Document Isolation
  // ---------------------------------------------------------------------------
  {
    name: "different documents are stored independently",
    category: Categories.DocumentIsolation,
    run: Effect.gen(function* () {
      const storage = yield* ColdStorageTag;
      const doc1 = makeDoc({ state: { id: 1 }, version: 1 });
      const doc2 = makeDoc({ state: { id: 2 }, version: 2 });
      yield* storage.save("iso-doc-1", doc1);
      yield* storage.save("iso-doc-2", doc2);
      const loaded1 = yield* storage.load("iso-doc-1");
      const loaded2 = yield* storage.load("iso-doc-2");
      yield* assertEqual(loaded1, doc1, "First document should be unchanged");
      yield* assertEqual(loaded2, doc2, "Second document should be unchanged");
    }),
  },

  {
    name: "deleting one document does not affect others",
    category: Categories.DocumentIsolation,
    run: Effect.gen(function* () {
      const storage = yield* ColdStorageTag;
      const doc1 = makeDoc({ state: { id: 1 } });
      const doc2 = makeDoc({ state: { id: 2 } });
      yield* storage.save("del-iso-1", doc1);
      yield* storage.save("del-iso-2", doc2);
      yield* storage.delete("del-iso-1");
      const loaded1 = yield* storage.load("del-iso-1");
      const loaded2 = yield* storage.load("del-iso-2");
      yield* assertUndefined(loaded1, "Deleted document should be undefined");
      yield* assertEqual(loaded2, doc2, "Other document should be unchanged");
    }),
  },

  {
    name: "updating one document does not affect others",
    category: Categories.DocumentIsolation,
    run: Effect.gen(function* () {
      const storage = yield* ColdStorageTag;
      const doc1v1 = makeDoc({ state: { id: 1, v: 1 }, version: 1 });
      const doc1v2 = makeDoc({ state: { id: 1, v: 2 }, version: 2 });
      const doc2 = makeDoc({ state: { id: 2 } });
      yield* storage.save("upd-iso-1", doc1v1);
      yield* storage.save("upd-iso-2", doc2);
      yield* storage.save("upd-iso-1", doc1v2);
      const loaded1 = yield* storage.load("upd-iso-1");
      const loaded2 = yield* storage.load("upd-iso-2");
      yield* assertEqual(loaded1, doc1v2, "Updated document should have new value");
      yield* assertEqual(loaded2, doc2, "Other document should be unchanged");
    }),
  },

  // ---------------------------------------------------------------------------
  // Consistency Guarantees
  // ---------------------------------------------------------------------------
  {
    name: "multiple saves to same doc, load returns latest",
    category: Categories.ConsistencyGuarantees,
    run: Effect.gen(function* () {
      const storage = yield* ColdStorageTag;
      const doc1 = makeDoc({ state: { v: 1 }, version: 1 });
      const doc2 = makeDoc({ state: { v: 2 }, version: 2 });
      const doc3 = makeDoc({ state: { v: 3 }, version: 3 });
      yield* storage.save("multi-save", doc1);
      yield* storage.save("multi-save", doc2);
      yield* storage.save("multi-save", doc3);
      const loaded = yield* storage.load("multi-save");
      yield* assertEqual(loaded, doc3, "Should return the latest saved document");
    }),
  },

  {
    name: "save-delete-save sequence works correctly",
    category: Categories.ConsistencyGuarantees,
    run: Effect.gen(function* () {
      const storage = yield* ColdStorageTag;
      const doc1 = makeDoc({ state: { phase: "first" }, version: 1 });
      const doc2 = makeDoc({ state: { phase: "second" }, version: 2 });
      yield* storage.save("sds-test", doc1);
      yield* storage.delete("sds-test");
      yield* storage.save("sds-test", doc2);
      const loaded = yield* storage.load("sds-test");
      yield* assertEqual(loaded, doc2, "Should return document saved after delete");
    }),
  },
];

// =============================================================================
// Exports
// =============================================================================

/**
 * Get all ColdStorage test cases.
 *
 * @returns Array of test cases that require ColdStorageTag
 */
export const makeTests = (): StorageTestCase<
  ColdStorageTestError,
  ColdStorageTag
>[] => tests;

/**
 * Run all tests and collect results.
 *
 * @returns Effect that produces TestResults
 */
export const runAll = (): Effect.Effect<
  TestResults<ColdStorageTestError, ColdStorageTag>,
  never,
  ColdStorageTag
> =>
  Effect.gen(function* () {
    const passed: StorageTestCase<ColdStorageTestError, ColdStorageTag>[] = [];
    const failed: Array<{
      test: StorageTestCase<ColdStorageTestError, ColdStorageTag>;
      error: ColdStorageTestError;
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

export const ColdStorageTestSuite = {
  Categories,
  makeTests,
  runAll,
};
