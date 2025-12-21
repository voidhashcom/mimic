/**
 * @since 0.0.1
 * Presence manager for ephemeral per-connection state.
 * Handles in-memory storage and broadcasting of presence updates.
 */
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as HashMap from "effect/HashMap";
import * as Context from "effect/Context";
import * as Scope from "effect/Scope";
import * as Stream from "effect/Stream";
import type { Presence } from "@voidhash/mimic";

// =============================================================================
// Presence Entry Types
// =============================================================================

/**
 * A presence entry stored in the manager.
 */
export interface PresenceEntry {
  /** The presence data */
  readonly data: unknown;
  /** Optional user ID from authentication */
  readonly userId?: string;
}

// =============================================================================
// Presence Events
// =============================================================================

/**
 * Event emitted when a presence is updated.
 */
export interface PresenceUpdateEvent {
  readonly type: "presence_update";
  /** The connection ID of the user who updated */
  readonly id: string;
  /** The presence data */
  readonly data: unknown;
  /** Optional user ID from authentication */
  readonly userId?: string;
}

/**
 * Event emitted when a presence is removed (user disconnected).
 */
export interface PresenceRemoveEvent {
  readonly type: "presence_remove";
  /** The connection ID of the user who disconnected */
  readonly id: string;
}

/**
 * Union of all presence events.
 */
export type PresenceEvent = PresenceUpdateEvent | PresenceRemoveEvent;

// =============================================================================
// Presence Snapshot
// =============================================================================

/**
 * A snapshot of all presence entries for a document.
 */
export interface PresenceSnapshot {
  /** Map of connectionId to presence entry */
  readonly presences: Record<string, PresenceEntry>;
}

// =============================================================================
// Document Presence Instance
// =============================================================================

/**
 * Per-document presence state.
 */
interface DocumentPresence {
  /** Map of connectionId to presence entry */
  readonly entries: Ref.Ref<HashMap.HashMap<string, PresenceEntry>>;
  /** PubSub for broadcasting presence events */
  readonly pubsub: PubSub.PubSub<PresenceEvent>;
}

// =============================================================================
// Presence Manager Service
// =============================================================================

/**
 * Service interface for the PresenceManager.
 */
export interface PresenceManager {
  /**
   * Get a snapshot of all presences for a document.
   */
  readonly getSnapshot: (
    documentId: string
  ) => Effect.Effect<PresenceSnapshot>;

  /**
   * Set/update presence for a connection.
   * Broadcasts the update to all subscribers.
   */
  readonly set: (
    documentId: string,
    connectionId: string,
    entry: PresenceEntry
  ) => Effect.Effect<void>;

  /**
   * Remove presence for a connection (e.g., on disconnect).
   * Broadcasts the removal to all subscribers.
   */
  readonly remove: (
    documentId: string,
    connectionId: string
  ) => Effect.Effect<void>;

  /**
   * Subscribe to presence events for a document.
   * Returns a Stream of presence events.
   */
  readonly subscribe: (
    documentId: string
  ) => Effect.Effect<
    Stream.Stream<PresenceEvent>,
    never,
    Scope.Scope
  >;
}

/**
 * Context tag for PresenceManager.
 */
export class PresenceManagerTag extends Context.Tag(
  "@voidhash/mimic-server-effect/PresenceManager"
)<PresenceManagerTag, PresenceManager>() {}

// =============================================================================
// Presence Manager Implementation
// =============================================================================

/**
 * Create the PresenceManager service.
 */
const makePresenceManager = Effect.gen(function* () {
  // Map of document ID to document presence state
  const documents = yield* Ref.make(
    HashMap.empty<string, DocumentPresence>()
  );

  // Get or create a document presence instance
  const getOrCreateDocument = (
    documentId: string
  ): Effect.Effect<DocumentPresence> =>
    Effect.gen(function* () {
      const current = yield* Ref.get(documents);
      const existing = HashMap.get(current, documentId);

      if (existing._tag === "Some") {
        return existing.value;
      }

      // Create new document presence
      const entries = yield* Ref.make(
        HashMap.empty<string, PresenceEntry>()
      );
      const pubsub = yield* PubSub.unbounded<PresenceEvent>();

      const docPresence: DocumentPresence = {
        entries,
        pubsub,
      };

      // Store in map
      yield* Ref.update(documents, (map) =>
        HashMap.set(map, documentId, docPresence)
      );

      return docPresence;
    });

  // Get snapshot of all presences for a document
  const getSnapshot = (documentId: string): Effect.Effect<PresenceSnapshot> =>
    Effect.gen(function* () {
      const docPresence = yield* getOrCreateDocument(documentId);
      const entriesMap = yield* Ref.get(docPresence.entries);

      // Convert HashMap to Record
      const presences: Record<string, PresenceEntry> = {};
      for (const [id, entry] of entriesMap) {
        presences[id] = entry;
      }

      return { presences };
    });

  // Set/update presence for a connection
  const set = (
    documentId: string,
    connectionId: string,
    entry: PresenceEntry
  ): Effect.Effect<void> =>
    Effect.gen(function* () {
      const docPresence = yield* getOrCreateDocument(documentId);

      // Update the entry
      yield* Ref.update(docPresence.entries, (map) =>
        HashMap.set(map, connectionId, entry)
      );

      // Broadcast the update
      yield* PubSub.publish(docPresence.pubsub, {
        type: "presence_update",
        id: connectionId,
        data: entry.data,
        userId: entry.userId,
      });
    });

  // Remove presence for a connection
  const remove = (
    documentId: string,
    connectionId: string
  ): Effect.Effect<void> =>
    Effect.gen(function* () {
      const current = yield* Ref.get(documents);
      const existing = HashMap.get(current, documentId);

      if (existing._tag === "None") {
        return; // Document doesn't exist, nothing to remove
      }

      const docPresence = existing.value;

      // Check if the connection has a presence
      const entries = yield* Ref.get(docPresence.entries);
      const hasEntry = HashMap.has(entries, connectionId);

      if (!hasEntry) {
        return; // No presence to remove
      }

      // Remove the entry
      yield* Ref.update(docPresence.entries, (map) =>
        HashMap.remove(map, connectionId)
      );

      // Broadcast the removal
      yield* PubSub.publish(docPresence.pubsub, {
        type: "presence_remove",
        id: connectionId,
      });
    });

  // Subscribe to presence events
  const subscribe = (
    documentId: string
  ): Effect.Effect<Stream.Stream<PresenceEvent>, never, Scope.Scope> =>
    Effect.gen(function* () {
      const docPresence = yield* getOrCreateDocument(documentId);

      // Subscribe to the PubSub
      const queue = yield* PubSub.subscribe(docPresence.pubsub);

      // Convert queue to stream
      return Stream.fromQueue(queue);
    });

  const manager: PresenceManager = {
    getSnapshot,
    set,
    remove,
    subscribe,
  };

  return manager;
});

/**
 * Layer that provides PresenceManager.
 */
export const layer: Layer.Layer<PresenceManagerTag> = Layer.effect(
  PresenceManagerTag,
  makePresenceManager
);

/**
 * Default layer that provides PresenceManager.
 * Uses the default priority for layer composition.
 */
export const layerDefault: Layer.Layer<PresenceManagerTag> = Layer.effectDiscard(
  Effect.succeed(undefined)
).pipe(Layer.provideMerge(layer));

