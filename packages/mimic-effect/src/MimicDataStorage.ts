/**
 * @since 0.0.1
 * Data storage service interface for Mimic documents.
 * Provides pluggable storage adapters with load/save hooks for data transformation.
 */
import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import * as Data from "effect/Data";

// =============================================================================
// Error Types
// =============================================================================

/**
 * Error when loading a document from storage fails.
 */
export class StorageLoadError extends Data.TaggedError("StorageLoadError")<{
  readonly documentId: string;
  readonly cause: unknown;
}> {
  get message(): string {
    return `Failed to load document ${this.documentId}: ${String(this.cause)}`;
  }
}

/**
 * Error when saving a document to storage fails.
 */
export class StorageSaveError extends Data.TaggedError("StorageSaveError")<{
  readonly documentId: string;
  readonly cause: unknown;
}> {
  get message(): string {
    return `Failed to save document ${this.documentId}: ${String(this.cause)}`;
  }
}

/**
 * Error when deleting a document from storage fails.
 */
export class StorageDeleteError extends Data.TaggedError("StorageDeleteError")<{
  readonly documentId: string;
  readonly cause: unknown;
}> {
  get message(): string {
    return `Failed to delete document ${this.documentId}: ${String(this.cause)}`;
  }
}

/**
 * Union of all storage errors.
 */
export type StorageError = StorageLoadError | StorageSaveError | StorageDeleteError;

// =============================================================================
// Storage Service Interface
// =============================================================================

/**
 * Data storage service interface.
 * Implementations can persist documents to various backends (memory, S3, database, etc.)
 */
export interface MimicDataStorage {
  /**
   * Load a document's state from storage.
   * @param documentId - The unique identifier for the document
   * @returns The document state, or undefined if not found
   */
  readonly load: (
    documentId: string
  ) => Effect.Effect<unknown | undefined, StorageLoadError>;

  /**
   * Save a document's state to storage.
   * @param documentId - The unique identifier for the document
   * @param state - The document state to persist
   */
  readonly save: (
    documentId: string,
    state: unknown
  ) => Effect.Effect<void, StorageSaveError>;

  /**
   * Delete a document from storage.
   * @param documentId - The unique identifier for the document
   */
  readonly delete: (
    documentId: string
  ) => Effect.Effect<void, StorageDeleteError>;

  /**
   * Transform data after loading from storage.
   * Useful for migrations, decryption, decompression, etc.
   * @param state - The raw state loaded from storage
   * @returns The transformed state
   */
  readonly onLoad: (state: unknown) => Effect.Effect<unknown>;

  /**
   * Transform/validate data before saving to storage.
   * Useful for encryption, compression, validation, etc.
   * @param state - The state to be saved
   * @returns The transformed state
   */
  readonly onSave: (state: unknown) => Effect.Effect<unknown>;
}

// =============================================================================
// Context Tag
// =============================================================================

/**
 * Context tag for MimicDataStorage service.
 */
export class MimicDataStorageTag extends Context.Tag(
  "@voidhash/mimic-server-effect/MimicDataStorage"
)<MimicDataStorageTag, MimicDataStorage>() {}

// =============================================================================
// Layer Constructors
// =============================================================================

/**
 * Create a MimicDataStorage layer from a storage implementation.
 */
export const layer = (storage: MimicDataStorage): Layer.Layer<MimicDataStorageTag> =>
  Layer.succeed(MimicDataStorageTag, storage);

/**
 * Create a MimicDataStorage layer from an Effect that produces a storage implementation.
 */
export const layerEffect = <E, R>(
  effect: Effect.Effect<MimicDataStorage, E, R>
): Layer.Layer<MimicDataStorageTag, E, R> =>
  Layer.effect(MimicDataStorageTag, effect);

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create a simple storage implementation with minimal configuration.
 */
export const make = (options: {
  readonly load: (documentId: string) => Effect.Effect<unknown | undefined, StorageLoadError>;
  readonly save: (documentId: string, state: unknown) => Effect.Effect<void, StorageSaveError>;
  readonly delete?: (documentId: string) => Effect.Effect<void, StorageDeleteError>;
  readonly onLoad?: (state: unknown) => Effect.Effect<unknown>;
  readonly onSave?: (state: unknown) => Effect.Effect<unknown>;
}): MimicDataStorage => ({
  load: options.load,
  save: options.save,
  delete: options.delete ?? (() => Effect.void),
  onLoad: options.onLoad ?? ((state) => Effect.succeed(state)),
  onSave: options.onSave ?? ((state) => Effect.succeed(state)),
});
