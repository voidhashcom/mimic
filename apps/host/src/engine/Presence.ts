import { Effect, HashMap, PubSub, Ref, Stream } from "effect";
import type { Scope } from "effect/Scope";
import type { PresenceEntry } from "./Protocol";

export interface PresenceEvent {
  readonly type: "presence_update" | "presence_remove";
  readonly id: string;
  readonly data?: unknown;
  readonly userId?: string;
}

export interface PresenceSnapshot {
  readonly presences: Record<string, PresenceEntry>;
}

interface DocumentPresenceState {
  readonly presences: HashMap.HashMap<string, PresenceEntry>;
  readonly pubsub: PubSub.PubSub<PresenceEvent>;
}

export interface PresenceManager {
  readonly getSnapshot: (documentId: string) => Effect.Effect<PresenceSnapshot>;
  readonly set: (documentId: string, connectionId: string, entry: PresenceEntry) => Effect.Effect<void>;
  readonly remove: (documentId: string, connectionId: string) => Effect.Effect<void>;
  readonly subscribe: (documentId: string) => Effect.Effect<Stream.Stream<PresenceEvent>, never, Scope>;
}

export const makePresenceManager = Effect.gen(function* () {
  const store = yield* Ref.make(HashMap.empty<string, DocumentPresenceState>());

  const getOrCreateDocumentState = (documentId: string) =>
    Effect.gen(function* () {
      const current = yield* Ref.get(store);
      const existing = HashMap.get(current, documentId);
      if (existing._tag === "Some") {
        return existing.value;
      }

      const pubsub = yield* PubSub.unbounded<PresenceEvent>();
      const state: DocumentPresenceState = {
        presences: HashMap.empty(),
        pubsub,
      };

      yield* Ref.update(store, (map) => HashMap.set(map, documentId, state));
      return state;
    });

  const manager: PresenceManager = {
    getSnapshot: (documentId) =>
      Effect.gen(function* () {
        const current = yield* Ref.get(store);
        const existing = HashMap.get(current, documentId);
        if (existing._tag === "None") {
          return { presences: {} };
        }

        const presences: Record<string, PresenceEntry> = {};
        for (const [id, entry] of existing.value.presences) {
          presences[id] = entry;
        }
        return { presences };
      }),

    set: (documentId, connectionId, entry) =>
      Effect.gen(function* () {
        const state = yield* getOrCreateDocumentState(documentId);

        yield* Ref.update(store, (map) => {
          const existing = HashMap.get(map, documentId);
          if (existing._tag === "None") return map;
          return HashMap.set(map, documentId, {
            ...existing.value,
            presences: HashMap.set(existing.value.presences, connectionId, entry),
          });
        });

        yield* PubSub.publish(state.pubsub, {
          type: "presence_update",
          id: connectionId,
          data: entry.data,
          userId: entry.userId,
        });
      }),

    remove: (documentId, connectionId) =>
      Effect.gen(function* () {
        const current = yield* Ref.get(store);
        const existing = HashMap.get(current, documentId);
        if (existing._tag === "None") return;

        if (!HashMap.has(existing.value.presences, connectionId)) return;

        yield* Ref.update(store, (map) => {
          const docState = HashMap.get(map, documentId);
          if (docState._tag === "None") return map;
          return HashMap.set(map, documentId, {
            ...docState.value,
            presences: HashMap.remove(docState.value.presences, connectionId),
          });
        });

        yield* PubSub.publish(existing.value.pubsub, {
          type: "presence_remove",
          id: connectionId,
        });
      }),

    subscribe: (documentId) =>
      Effect.gen(function* () {
        const state = yield* getOrCreateDocumentState(documentId);
        return Stream.fromPubSub(state.pubsub);
      }),
  };

  return manager;
});
