/**
 * @voidhash/mimic-effect - HotStorage
 *
 * Interface and implementations for Write-Ahead Log (WAL) storage.
 */
import { Context, Effect, HashMap, Layer, Ref } from "effect";
import type { WalEntry } from "./Types";
import { HotStorageError, WalVersionGapError } from "./Errors";

// =============================================================================
// HotStorage Interface
// =============================================================================

/**
 * HotStorage interface for storing Write-Ahead Log entries.
 *
 * This is the "hot" tier of the two-tier storage system.
 * It stores every transaction as a WAL entry for durability between snapshots.
 * WAL entries are small (just the transaction) and writes are append-only.
 */
export interface HotStorage {
  /**
   * Append a WAL entry for a document.
   */
  readonly append: (
    documentId: string,
    entry: WalEntry
  ) => Effect.Effect<void, HotStorageError>;

  /**
   * Append a WAL entry with version gap checking.
   *
   * This is an atomic operation that:
   * 1. Verifies the previous entry has version = expectedVersion - 1
   *    (or this is the first entry if expectedVersion === 1, accounting for baseVersion)
   * 2. Appends the entry if check passes
   *
   * Use this for two-phase commit to guarantee WAL ordering at write time.
   *
   * @param documentId - Document ID
   * @param entry - WAL entry to append
   * @param expectedVersion - The version this entry should have (entry.version)
   * @param baseVersion - Optional known snapshot version. When provided, an empty WAL
   *                      is treated as "at this version" rather than "new document at version 0".
   *                      This is necessary after truncation or restart to correctly validate
   *                      that the next entry is baseVersion + 1.
   * @returns Effect that fails with WalVersionGapError if gap detected
   */
  readonly appendWithCheck: (
    documentId: string,
    entry: WalEntry,
    expectedVersion: number,
    baseVersion?: number
  ) => Effect.Effect<void, HotStorageError | WalVersionGapError>;

  /**
   * Get all WAL entries for a document since a given version.
   * Returns entries with version > sinceVersion, ordered by version.
   */
  readonly getEntries: (
    documentId: string,
    sinceVersion: number
  ) => Effect.Effect<WalEntry[], HotStorageError>;

  /**
   * Truncate WAL entries up to (and including) a given version.
   * Called after a snapshot is saved to remove entries that are now in the snapshot.
   */
  readonly truncate: (
    documentId: string,
    upToVersion: number
  ) => Effect.Effect<void, HotStorageError>;
}

// =============================================================================
// Context Tag
// =============================================================================

/**
 * Context tag for HotStorage service
 */
export class HotStorageTag extends Context.Tag("@voidhash/mimic-effect/HotStorage")<
  HotStorageTag,
  HotStorage
>() {}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a HotStorage layer from an Effect that produces a HotStorage service.
 *
 * This allows you to access other Effect services when implementing custom storage.
 *
 * @example
 * ```typescript
 * const Hot = HotStorage.make(
 *   Effect.gen(function*() {
 *     const redis = yield* RedisService
 *
 *     return {
 *       append: (documentId, entry) =>
 *         redis.rpush(`wal:${documentId}`, JSON.stringify(entry)),
 *       getEntries: (documentId, sinceVersion) =>
 *         redis.lrange(`wal:${documentId}`, 0, -1).pipe(
 *           Effect.map(entries =>
 *             entries
 *               .map(e => JSON.parse(e))
 *               .filter(e => e.version > sinceVersion)
 *               .sort((a, b) => a.version - b.version)
 *           )
 *         ),
 *       truncate: (documentId, upToVersion) =>
 *         // Implementation depends on Redis data structure
 *         Effect.void,
 *     }
 *   })
 * )
 * ```
 */
export const make = <E, R>(
  effect: Effect.Effect<HotStorage, E, R>
): Layer.Layer<HotStorageTag, E, R> =>
  Layer.effect(HotStorageTag, effect);

// =============================================================================
// InMemory Implementation
// =============================================================================

/**
 * In-memory HotStorage implementation.
 *
 * Useful for testing and development. Not suitable for production
 * as data is lost when the process restarts.
 */
export namespace InMemory {
  /**
   * Create an in-memory HotStorage layer.
   */
  export const make = (): Layer.Layer<HotStorageTag> =>
    Layer.effect(
      HotStorageTag,
      Effect.fn("hot-storage.in-memory.create")(function* () {
        const store = yield* Ref.make(HashMap.empty<string, WalEntry[]>());

        return {
          append: Effect.fn("hot-storage.append")(
            function* (documentId: string, entry: WalEntry) {
              yield* Ref.update(store, (map) => {
                const existing = HashMap.get(map, documentId);
                const entries =
                  existing._tag === "Some" ? existing.value : [];
                return HashMap.set(map, documentId, [...entries, entry]);
              });
            }
          ),

          appendWithCheck: Effect.fn("hot-storage.append-with-check")(
            function* (
              documentId: string,
              entry: WalEntry,
              expectedVersion: number,
              baseVersion?: number
            ) {
              type CheckResult =
                | { type: "ok" }
                | { type: "gap"; lastVersion: number | undefined };

              // Use Ref.modify for atomic check + update
              const result: CheckResult = yield* Ref.modify(
                store,
                (map): [CheckResult, HashMap.HashMap<string, WalEntry[]>] => {
                  const existing = HashMap.get(map, documentId);
                  const entries =
                    existing._tag === "Some" ? existing.value : [];

                  // Find the highest version in existing entries
                  const lastEntryVersion =
                    entries.length > 0
                      ? Math.max(...entries.map((e) => e.version))
                      : 0;

                  // Effective "last version" is max of entries and baseVersion
                  // This handles the case after truncation or restart where
                  // WAL is empty but we know the snapshot version
                  const effectiveLastVersion =
                    baseVersion !== undefined
                      ? Math.max(lastEntryVersion, baseVersion)
                      : lastEntryVersion;

                  // Gap check
                  if (expectedVersion === 1) {
                    // First entry: should have no entries with version >= 1
                    // and baseVersion should be 0 or undefined
                    if (effectiveLastVersion >= 1) {
                      return [{ type: "gap", lastVersion: effectiveLastVersion }, map];
                    }
                  } else {
                    // Not first: effective last version should be expectedVersion - 1
                    if (effectiveLastVersion !== expectedVersion - 1) {
                      return [
                        {
                          type: "gap",
                          lastVersion: effectiveLastVersion > 0 ? effectiveLastVersion : undefined,
                        },
                        map,
                      ];
                    }
                  }

                  // No gap: append and return success
                  return [
                    { type: "ok" },
                    HashMap.set(map, documentId, [...entries, entry]),
                  ];
                }
              );

              if (result.type === "gap") {
                return yield* Effect.fail(
                  new WalVersionGapError({
                    documentId,
                    expectedVersion,
                    actualPreviousVersion: result.lastVersion,
                  })
                );
              }
            }
          ),

          getEntries: Effect.fn("hot-storage.get-entries")(
            function* (documentId: string, sinceVersion: number) {
              const current = yield* Ref.get(store);
              const existing = HashMap.get(current, documentId);
              const entries =
                existing._tag === "Some" ? existing.value : [];
              return entries
                .filter((e) => e.version > sinceVersion)
                .sort((a, b) => a.version - b.version);
            }
          ),

          truncate: Effect.fn("hot-storage.truncate")(
            function* (documentId: string, upToVersion: number) {
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
            }
          ),
        };
      })()
    );
}

// =============================================================================
// Re-export namespace
// =============================================================================

export const HotStorage = {
  Tag: HotStorageTag,
  make,
  InMemory,
};
