/**
 * @voidhash/mimic-effect - ColdStorage
 *
 * Interface and implementations for document snapshot storage.
 */
import { Context, Effect, HashMap, Layer, Ref } from "effect";
import type { StoredDocument } from "./Types";
import { ColdStorageError } from "./Errors";

// =============================================================================
// ColdStorage Interface
// =============================================================================

/**
 * ColdStorage interface for storing document snapshots.
 *
 * This is the "cold" tier of the two-tier storage system.
 * It stores complete document snapshots less frequently (on periodic intervals
 * or after a threshold of transactions).
 */
export interface ColdStorage {
  /**
   * Load a document snapshot.
   * Returns undefined if the document doesn't exist.
   */
  readonly load: (
    documentId: string
  ) => Effect.Effect<StoredDocument | undefined, ColdStorageError>;

  /**
   * Save a document snapshot.
   */
  readonly save: (
    documentId: string,
    document: StoredDocument
  ) => Effect.Effect<void, ColdStorageError>;

  /**
   * Delete a document snapshot.
   */
  readonly delete: (
    documentId: string
  ) => Effect.Effect<void, ColdStorageError>;
}

// =============================================================================
// Context Tag
// =============================================================================

/**
 * Context tag for ColdStorage service
 */
export class ColdStorageTag extends Context.Tag("@voidhash/mimic-effect/ColdStorage")<
  ColdStorageTag,
  ColdStorage
>() {}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a ColdStorage layer from an Effect that produces a ColdStorage service.
 *
 * This allows you to access other Effect services when implementing custom storage.
 *
 * @example
 * ```typescript
 * const Cold = ColdStorage.make(
 *   Effect.gen(function*() {
 *     const redis = yield* RedisService
 *
 *     return {
 *       load: (documentId) => redis.get(`doc:${documentId}`).pipe(
 *         Effect.map(data => data ? JSON.parse(data) : undefined)
 *       ),
 *       save: (documentId, document) =>
 *         redis.set(`doc:${documentId}`, JSON.stringify(document)),
 *       delete: (documentId) => redis.del(`doc:${documentId}`),
 *     }
 *   })
 * )
 * ```
 */
export const make = <E, R>(
  effect: Effect.Effect<ColdStorage, E, R>
): Layer.Layer<ColdStorageTag, E, R> =>
  Layer.effect(ColdStorageTag, effect);

// =============================================================================
// InMemory Implementation
// =============================================================================

/**
 * In-memory ColdStorage implementation.
 *
 * Useful for testing and development. Not suitable for production
 * as data is lost when the process restarts.
 */
export namespace InMemory {
  /**
   * Create an in-memory ColdStorage layer.
   */
  export const make = (): Layer.Layer<ColdStorageTag> =>
    Layer.effect(
      ColdStorageTag,
      Effect.fn("cold-storage.in-memory.create")(function* () {
        const store = yield* Ref.make(HashMap.empty<string, StoredDocument>());

        return {
          load: Effect.fn("cold-storage.load")(function* (documentId: string) {
            const current = yield* Ref.get(store);
            const result = HashMap.get(current, documentId);
            return result._tag === "Some" ? result.value : undefined;
          }),

          save: Effect.fn("cold-storage.save")(
            function* (documentId: string, document: StoredDocument) {
              yield* Ref.update(store, (map) =>
                HashMap.set(map, documentId, document)
              );
            }
          ),

          delete: Effect.fn("cold-storage.delete")(
            function* (documentId: string) {
              yield* Ref.update(store, (map) =>
                HashMap.remove(map, documentId)
              );
            }
          ),
        };
      })()
    );
}

// =============================================================================
// Re-export namespace
// =============================================================================

export const ColdStorage = {
  Tag: ColdStorageTag,
  make,
  InMemory,
};
