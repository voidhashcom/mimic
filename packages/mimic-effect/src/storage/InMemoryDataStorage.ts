/**
 * @since 0.0.1
 * In-memory data storage implementation for Mimic documents.
 * Provides ephemeral storage - data is lost when the server restarts.
 */
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";
import * as HashMap from "effect/HashMap";

import {
  MimicDataStorageTag,
  type MimicDataStorage,
} from "../MimicDataStorage.js";

// =============================================================================
// In-Memory Storage Implementation
// =============================================================================

/**
 * Create an in-memory storage service.
 * Uses a HashMap to store documents in memory.
 */
const makeInMemoryStorage = Effect.gen(function* () {
  // Create a mutable reference to a HashMap for storing documents
  const store = yield* Ref.make(HashMap.empty<string, unknown>());

  const storage: MimicDataStorage = {
    load: (documentId: string) =>
      Effect.gen(function* () {
        const current = yield* Ref.get(store);
        const result = HashMap.get(current, documentId);
        return result._tag === "Some" ? result.value : undefined;
      }),

    save: (documentId: string, state: unknown) =>
      Ref.update(store, (map) => HashMap.set(map, documentId, state)),

    delete: (documentId: string) =>
      Ref.update(store, (map) => HashMap.remove(map, documentId)),

    onLoad: (state: unknown) => Effect.succeed(state),

    onSave: (state: unknown) => Effect.succeed(state),
  };

  return storage;
});

// =============================================================================
// Layer
// =============================================================================

/**
 * Layer that provides in-memory data storage.
 * This is the default storage implementation - ephemeral and non-persistent.
 */
export const layer: Layer.Layer<MimicDataStorageTag> = Layer.effect(
  MimicDataStorageTag,
  makeInMemoryStorage
);

/**
 * Default layer alias for convenience.
 */
export const layerDefault = layer;
