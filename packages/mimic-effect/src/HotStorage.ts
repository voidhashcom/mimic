/**
 * @voidhash/mimic-effect - HotStorage
 *
 * Interface and implementations for Write-Ahead Log (WAL) storage.
 */
import { Context, Effect, HashMap, Layer, Ref } from "effect";
import type { WalEntry } from "./Types.js";
import { HotStorageError } from "./Errors.js";

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
      Effect.gen(function* () {
        const store = yield* Ref.make(HashMap.empty<string, WalEntry[]>());

        return {
          append: (documentId, entry) =>
            Ref.update(store, (map) => {
              const existing = HashMap.get(map, documentId);
              const entries =
                existing._tag === "Some" ? existing.value : [];
              return HashMap.set(map, documentId, [...entries, entry]);
            }),

          getEntries: (documentId, sinceVersion) =>
            Effect.gen(function* () {
              const current = yield* Ref.get(store);
              const existing = HashMap.get(current, documentId);
              const entries =
                existing._tag === "Some" ? existing.value : [];
              return entries
                .filter((e) => e.version > sinceVersion)
                .sort((a, b) => a.version - b.version);
            }),

          truncate: (documentId, upToVersion) =>
            Ref.update(store, (map) => {
              const existing = HashMap.get(map, documentId);
              if (existing._tag === "None") {
                return map;
              }
              const filtered = existing.value.filter(
                (e) => e.version > upToVersion
              );
              return HashMap.set(map, documentId, filtered);
            }),
        };
      })
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
