/**
 * @voidhash/mimic-effect - PresenceManager
 *
 * Internal service for managing presence state per document.
 */
import {
  Context,
  Effect,
  HashMap,
  Layer,
  Metric,
  PubSub,
  Ref,
  Scope,
  Stream,
} from "effect";
import type {
  PresenceEntry,
  PresenceEvent,
  PresenceSnapshot,
} from "./Types";
import * as Metrics from "./Metrics";

// =============================================================================
// PresenceManager Interface
// =============================================================================

/**
 * Internal service for managing presence state per document.
 *
 * Presence is ephemeral state associated with connections, not persisted.
 * Each document has its own set of presences, keyed by connectionId.
 */
export interface PresenceManager {
  /**
   * Get snapshot of all presences for a document.
   */
  readonly getSnapshot: (
    documentId: string
  ) => Effect.Effect<PresenceSnapshot>;

  /**
   * Set/update presence for a connection.
   */
  readonly set: (
    documentId: string,
    connectionId: string,
    entry: PresenceEntry
  ) => Effect.Effect<void>;

  /**
   * Remove presence for a connection (on disconnect).
   */
  readonly remove: (
    documentId: string,
    connectionId: string
  ) => Effect.Effect<void>;

  /**
   * Subscribe to presence events for a document.
   * Returns a stream of presence update/remove events.
   */
  readonly subscribe: (
    documentId: string
  ) => Effect.Effect<Stream.Stream<PresenceEvent>, never, Scope.Scope>;
}

// =============================================================================
// Context Tag
// =============================================================================

/**
 * Context tag for PresenceManager service
 */
export class PresenceManagerTag extends Context.Tag(
  "@voidhash/mimic-effect/PresenceManager"
)<PresenceManagerTag, PresenceManager>() {}

// =============================================================================
// Internal Types
// =============================================================================

/**
 * Per-document presence state
 */
interface DocumentPresenceState {
  readonly presences: HashMap.HashMap<string, PresenceEntry>;
  readonly pubsub: PubSub.PubSub<PresenceEvent>;
}

// =============================================================================
// Layer Implementation
// =============================================================================

/**
 * Create the PresenceManager layer.
 */
export const layer: Layer.Layer<PresenceManagerTag> = Layer.effect(
  PresenceManagerTag,
  Effect.gen(function* () {
    // Store: documentId -> DocumentPresenceState
    const store = yield* Ref.make(
      HashMap.empty<string, DocumentPresenceState>()
    );

    /**
     * Get or create presence state for a document
     */
    const getOrCreateDocumentState = Effect.fn(
      "presence.document-state.get-or-create"
    )(function* (documentId: string) {
      const current = yield* Ref.get(store);
      const existing = HashMap.get(current, documentId);
      if (existing._tag === "Some") {
        return existing.value;
      }

      // Create new state for this document
      const pubsub = yield* PubSub.unbounded<PresenceEvent>();
      const state: DocumentPresenceState = {
        presences: HashMap.empty(),
        pubsub,
      };

      yield* Ref.update(store, (map) => HashMap.set(map, documentId, state));
      return state;
    });

    return {
      getSnapshot: Effect.fn("presence.snapshot.get")(
        function* (documentId: string) {
          const current = yield* Ref.get(store);
          const existing = HashMap.get(current, documentId);
          if (existing._tag === "None") {
            return { presences: {} };
          }

          // Convert HashMap to Record
          const presences: Record<string, PresenceEntry> = {};
          for (const [id, entry] of existing.value.presences) {
            presences[id] = entry;
          }
          return { presences };
        }
      ),

      set: Effect.fn("presence.set")(
        function* (
          documentId: string,
          connectionId: string,
          entry: PresenceEntry
        ) {
          const state = yield* getOrCreateDocumentState(documentId);

          // Update presence in store
          yield* Ref.update(store, (map) => {
            const existing = HashMap.get(map, documentId);
            if (existing._tag === "None") return map;
            return HashMap.set(map, documentId, {
              ...existing.value,
              presences: HashMap.set(
                existing.value.presences,
                connectionId,
                entry
              ),
            });
          });

          // Track metrics
          yield* Metric.increment(Metrics.presenceUpdates);
          yield* Metric.incrementBy(Metrics.presenceActive, 1);

          // Broadcast update event
          const event: PresenceEvent = {
            type: "presence_update",
            id: connectionId,
            data: entry.data,
            userId: entry.userId,
          };
          yield* PubSub.publish(state.pubsub, event);
        }
      ),

      remove: Effect.fn("presence.remove")(
        function* (documentId: string, connectionId: string) {
          const current = yield* Ref.get(store);
          const existing = HashMap.get(current, documentId);
          if (existing._tag === "None") return;

          // Check if presence exists before removing
          const hasPresence = HashMap.has(
            existing.value.presences,
            connectionId
          );
          if (!hasPresence) return;

          // Remove presence from store
          yield* Ref.update(store, (map) => {
            const docState = HashMap.get(map, documentId);
            if (docState._tag === "None") return map;
            return HashMap.set(map, documentId, {
              ...docState.value,
              presences: HashMap.remove(docState.value.presences, connectionId),
            });
          });

          // Track metrics
          yield* Metric.incrementBy(Metrics.presenceActive, -1);

          // Broadcast remove event
          const event: PresenceEvent = {
            type: "presence_remove",
            id: connectionId,
          };
          yield* PubSub.publish(existing.value.pubsub, event);
        }
      ),

      subscribe: Effect.fn("presence.subscribe")(
        function* (documentId: string) {
          const state = yield* getOrCreateDocumentState(documentId);
          return Stream.fromPubSub(state.pubsub);
        }
      ),
    };
  })
);

// =============================================================================
// Re-export namespace
// =============================================================================

export const PresenceManager = {
  Tag: PresenceManagerTag,
  layer,
};
