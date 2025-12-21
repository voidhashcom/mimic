import { describe, it, expect, beforeEach, vi } from "vitest";
import { createStore } from "zustand";
import { mimic } from "../../src/zustand/middleware";
import type { ClientDocument } from "@voidhash/mimic/client";
import type { Primitive, Presence } from "@voidhash/mimic";

// =============================================================================
// Mock ClientDocument
// =============================================================================

interface MockClientDocumentState {
  snapshot: { title: string; count: number };
  isConnected: boolean;
  isReady: boolean;
  pendingCount: number;
  hasPendingChanges: boolean;
  // Presence
  presenceEnabled: boolean;
  presenceSelfId?: string;
  presenceSelf?: unknown;
  presenceOthers: Map<string, Presence.PresenceEntry<unknown>>;
}

interface MockClientDocument {
  root: { toSnapshot: () => { title: string; count: number } };
  isConnected: () => boolean;
  isReady: () => boolean;
  getPendingCount: () => number;
  hasPendingChanges: () => boolean;
  connect: () => void;
  subscribe: (listener: {
    onStateChange?: () => void;
    onConnectionChange?: () => void;
    onReady?: () => void;
  }) => () => void;
  presence?: {
    selfId: () => string | undefined;
    self: () => unknown | undefined;
    others: () => ReadonlyMap<string, Presence.PresenceEntry<unknown>>;
    all: () => ReadonlyMap<string, Presence.PresenceEntry<unknown>>;
    subscribe: (listener: { onPresenceChange?: () => void }) => () => void;
  };
  // Helpers to update state and trigger events
  _setState: (updates: Partial<MockClientDocumentState>) => void;
  _triggerStateChange: () => void;
  _triggerConnectionChange: () => void;
  _triggerReady: () => void;
  _triggerPresenceChange: () => void;
  _getSubscriberCount: () => number;
}

const createMockClientDocument = (
  initial?: Partial<MockClientDocumentState>
): MockClientDocument => {
  let state: MockClientDocumentState = {
    snapshot: { title: "Test", count: 0 },
    isConnected: false,
    isReady: false,
    pendingCount: 0,
    hasPendingChanges: false,
    presenceEnabled: false,
    presenceOthers: new Map(),
    ...initial,
  };

  const listeners = new Set<{
    onStateChange?: () => void;
    onConnectionChange?: () => void;
    onReady?: () => void;
  }>();

  const presenceListeners = new Set<{ onPresenceChange?: () => void }>();

  return {
    root: {
      toSnapshot: () => state.snapshot,
    },
    isConnected: () => state.isConnected,
    isReady: () => state.isReady,
    getPendingCount: () => state.pendingCount,
    hasPendingChanges: () => state.hasPendingChanges,
    connect: () => {
      // Mock connect - does nothing in tests
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    presence: state.presenceEnabled
      ? {
          selfId: () => state.presenceSelfId,
          self: () => state.presenceSelf,
          others: () => state.presenceOthers,
          all: () => {
            const all = new Map<string, Presence.PresenceEntry<unknown>>();
            for (const [id, entry] of state.presenceOthers) {
              all.set(id, entry);
            }
            if (state.presenceSelfId !== undefined && state.presenceSelf !== undefined) {
              all.set(state.presenceSelfId, { data: state.presenceSelf });
            }
            return all;
          },
          subscribe: (listener) => {
            presenceListeners.add(listener);
            return () => {
              presenceListeners.delete(listener);
            };
          },
        }
      : undefined,
    _setState: (updates) => {
      state = { ...state, ...updates };
    },
    _triggerStateChange: () => {
      for (const listener of listeners) {
        listener.onStateChange?.();
      }
    },
    _triggerConnectionChange: () => {
      for (const listener of listeners) {
        listener.onConnectionChange?.();
      }
    },
    _triggerReady: () => {
      for (const listener of listeners) {
        listener.onReady?.();
      }
    },
    _triggerPresenceChange: () => {
      for (const listener of presenceListeners) {
        listener.onPresenceChange?.();
      }
    },
    _getSubscriberCount: () => listeners.size,
  };
};

// =============================================================================
// Test Schema Type (for type inference)
// =============================================================================

type TestSchema = Primitive.Primitive<
  { title: string; count: number },
  { toSnapshot: () => { title: string; count: number } }
>;

// =============================================================================
// Tests
// =============================================================================

describe("mimic middleware", () => {
  let mockDocument: MockClientDocument;

  beforeEach(() => {
    mockDocument = createMockClientDocument();
  });

  describe("Basic Integration", () => {
    it("should create store with initial mimic slice", () => {
      mockDocument._setState({
        snapshot: { title: "Initial", count: 42 },
        isConnected: true,
        isReady: true,
        pendingCount: 0,
        hasPendingChanges: false,
      });

      const store = createStore(
        mimic(mockDocument as unknown as ClientDocument.ClientDocument<TestSchema>, () => ({}))
      );

      const state = store.getState();

      expect(state.mimic).toBeDefined();
      expect(state.mimic.snapshot).toEqual({ title: "Initial", count: 42 });
      expect(state.mimic.isConnected).toBe(true);
      expect(state.mimic.isReady).toBe(true);
      expect(state.mimic.pendingCount).toBe(0);
      expect(state.mimic.hasPendingChanges).toBe(false);
    });

    it("should preserve user state alongside mimic slice", () => {
      const store = createStore(
        mimic(mockDocument as unknown as ClientDocument.ClientDocument<TestSchema>, () => ({
          customField: "hello",
          customNumber: 123,
        }))
      );

      const state = store.getState();

      expect(state.customField).toBe("hello");
      expect(state.customNumber).toBe(123);
      expect(state.mimic).toBeDefined();
    });

    it("should provide document reference via state.mimic.document", () => {
      const store = createStore(
        mimic(mockDocument as unknown as ClientDocument.ClientDocument<TestSchema>, () => ({}))
      );

      const state = store.getState();

      expect(state.mimic.document).toBe(mockDocument);
    });

    it("should reflect initial document state correctly", () => {
      mockDocument._setState({
        snapshot: { title: "Doc Title", count: 99 },
        isConnected: false,
        isReady: false,
        pendingCount: 3,
        hasPendingChanges: true,
      });

      const store = createStore(
        mimic(mockDocument as unknown as ClientDocument.ClientDocument<TestSchema>, () => ({}))
      );

      const state = store.getState();

      expect(state.mimic.snapshot).toEqual({ title: "Doc Title", count: 99 });
      expect(state.mimic.isConnected).toBe(false);
      expect(state.mimic.isReady).toBe(false);
      expect(state.mimic.pendingCount).toBe(3);
      expect(state.mimic.hasPendingChanges).toBe(true);
    });
  });

  describe("Reactive Updates", () => {
    it("should update store when onStateChange fires", () => {
      mockDocument._setState({
        snapshot: { title: "Before", count: 1 },
      });

      const store = createStore(
        mimic(mockDocument as unknown as ClientDocument.ClientDocument<TestSchema>, () => ({}))
      );

      expect(store.getState().mimic.snapshot).toEqual({ title: "Before", count: 1 });

      // Update document state and trigger change
      mockDocument._setState({
        snapshot: { title: "After", count: 2 },
      });
      mockDocument._triggerStateChange();

      expect(store.getState().mimic.snapshot).toEqual({ title: "After", count: 2 });
    });

    it("should update store when onConnectionChange fires", () => {
      mockDocument._setState({
        isConnected: false,
      });

      const store = createStore(
        mimic(mockDocument as unknown as ClientDocument.ClientDocument<TestSchema>, () => ({}))
      );

      expect(store.getState().mimic.isConnected).toBe(false);

      // Update connection status and trigger change
      mockDocument._setState({
        isConnected: true,
      });
      mockDocument._triggerConnectionChange();

      expect(store.getState().mimic.isConnected).toBe(true);
    });

    it("should update store when onReady fires", () => {
      mockDocument._setState({
        isReady: false,
      });

      const store = createStore(
        mimic(mockDocument as unknown as ClientDocument.ClientDocument<TestSchema>, () => ({}))
      );

      expect(store.getState().mimic.isReady).toBe(false);

      // Update ready status and trigger change
      mockDocument._setState({
        isReady: true,
      });
      mockDocument._triggerReady();

      expect(store.getState().mimic.isReady).toBe(true);
    });

    it("should update pendingCount and hasPendingChanges on state change", () => {
      mockDocument._setState({
        pendingCount: 0,
        hasPendingChanges: false,
      });

      const store = createStore(
        mimic(mockDocument as unknown as ClientDocument.ClientDocument<TestSchema>, () => ({}))
      );

      expect(store.getState().mimic.pendingCount).toBe(0);
      expect(store.getState().mimic.hasPendingChanges).toBe(false);

      // Simulate pending transactions
      mockDocument._setState({
        pendingCount: 5,
        hasPendingChanges: true,
      });
      mockDocument._triggerStateChange();

      expect(store.getState().mimic.pendingCount).toBe(5);
      expect(store.getState().mimic.hasPendingChanges).toBe(true);
    });

    it("should update all mimic properties on any event", () => {
      mockDocument._setState({
        snapshot: { title: "V1", count: 1 },
        isConnected: false,
        isReady: false,
        pendingCount: 0,
        hasPendingChanges: false,
      });

      const store = createStore(
        mimic(mockDocument as unknown as ClientDocument.ClientDocument<TestSchema>, () => ({}))
      );

      // Update all state at once
      mockDocument._setState({
        snapshot: { title: "V2", count: 2 },
        isConnected: true,
        isReady: true,
        pendingCount: 3,
        hasPendingChanges: true,
      });

      // Triggering any event should refresh all mimic state
      mockDocument._triggerConnectionChange();

      const state = store.getState().mimic;
      expect(state.snapshot).toEqual({ title: "V2", count: 2 });
      expect(state.isConnected).toBe(true);
      expect(state.isReady).toBe(true);
      expect(state.pendingCount).toBe(3);
      expect(state.hasPendingChanges).toBe(true);
    });
  });

  describe("Presence", () => {
    it("should expose reactive self + others presence when enabled", () => {
      mockDocument = createMockClientDocument({
        presenceEnabled: true,
        presenceSelfId: "self",
        presenceSelf: { name: "me" },
        presenceOthers: new Map([
          ["other-1", { data: { name: "alice" }, userId: "u1" }],
        ]),
      });

      const store = createStore(
        mimic(mockDocument as unknown as ClientDocument.ClientDocument<TestSchema>, () => ({}))
      );

      const presence = (store.getState().mimic as any).presence;
      expect(presence).toBeDefined();
      expect(presence.selfId).toBe("self");
      expect(presence.self).toEqual({ name: "me" });
      expect(presence.others).toBeInstanceOf(Map);
      expect(presence.all).toBeInstanceOf(Map);
      expect(presence.others.get("other-1")).toEqual({ data: { name: "alice" }, userId: "u1" });
      expect(presence.all.get("self")).toEqual({ data: { name: "me" } });
    });

    it("should update store when onPresenceChange fires (and clone Map references)", () => {
      mockDocument = createMockClientDocument({
        presenceEnabled: true,
        presenceSelfId: "self",
        presenceSelf: { name: "me" },
        presenceOthers: new Map(),
      });

      const store = createStore(
        mimic(mockDocument as unknown as ClientDocument.ClientDocument<TestSchema>, () => ({}))
      );

      const beforePresence = (store.getState().mimic as any).presence;
      const beforeOthersRef = beforePresence.others;
      expect(beforePresence.self).toEqual({ name: "me" });
      expect(beforePresence.others.size).toBe(0);

      // Update others + self and trigger presence change
      mockDocument._setState({
        presenceSelf: { name: "me-2" },
        presenceOthers: new Map([
          ["other-1", { data: { name: "alice" }, userId: "u1" }],
        ]),
      });
      mockDocument._triggerPresenceChange();

      const afterPresence = (store.getState().mimic as any).presence;
      expect(afterPresence.self).toEqual({ name: "me-2" });
      expect(afterPresence.others.get("other-1")).toEqual({ data: { name: "alice" }, userId: "u1" });

      // Critical: maps should be new references so selectors re-render
      expect(afterPresence.others).not.toBe(beforeOthersRef);
    });
  });

  describe("Options", () => {
    it("should subscribe to document events by default (autoSubscribe: true)", () => {
      const store = createStore(
        mimic(mockDocument as unknown as ClientDocument.ClientDocument<TestSchema>, () => ({}))
      );

      expect(mockDocument._getSubscriberCount()).toBe(1);

      // Verify subscription is active by updating and triggering
      mockDocument._setState({ snapshot: { title: "Updated", count: 10 } });
      mockDocument._triggerStateChange();

      expect(store.getState().mimic.snapshot).toEqual({ title: "Updated", count: 10 });
    });

    it("should subscribe to document events when autoSubscribe: true explicitly", () => {
      const store = createStore(
        mimic(
          mockDocument as unknown as ClientDocument.ClientDocument<TestSchema>,
          () => ({}),
          { autoSubscribe: true }
        )
      );

      expect(mockDocument._getSubscriberCount()).toBe(1);
    });

    it("should not subscribe to document events when autoSubscribe: false", () => {
      const store = createStore(
        mimic(
          mockDocument as unknown as ClientDocument.ClientDocument<TestSchema>,
          () => ({}),
          { autoSubscribe: false }
        )
      );

      expect(mockDocument._getSubscriberCount()).toBe(0);

      // Verify store doesn't update when events fire
      const initialSnapshot = store.getState().mimic.snapshot;
      mockDocument._setState({ snapshot: { title: "Should Not Update", count: 999 } });
      mockDocument._triggerStateChange();

      expect(store.getState().mimic.snapshot).toEqual(initialSnapshot);
    });
  });

  describe("User State Integration", () => {
    it("should allow user state to use set function", () => {
      interface UserState {
        localCount: number;
        increment: () => void;
      }

      const store = createStore(
        mimic<TestSchema, undefined, UserState>(
          mockDocument as unknown as ClientDocument.ClientDocument<TestSchema>,
          (set) => ({
            localCount: 0,
            increment: () => set((state) => ({ ...state, localCount: state.localCount + 1 })),
          })
        )
      );

      expect(store.getState().localCount).toBe(0);

      store.getState().increment();

      expect(store.getState().localCount).toBe(1);
      // Mimic state should still be present
      expect(store.getState().mimic).toBeDefined();
    });

    it("should allow user state to use get function", () => {
      interface UserState {
        localCount: number;
        doubleCount: () => number;
      }

      const store = createStore(
        mimic<TestSchema, undefined, UserState>(
          mockDocument as unknown as ClientDocument.ClientDocument<TestSchema>,
          (set, get) => ({
            localCount: 5,
            doubleCount: () => get().localCount * 2,
          })
        )
      );

      expect(store.getState().doubleCount()).toBe(10);
    });

    it("should preserve mimic state when user state changes", () => {
      mockDocument._setState({
        snapshot: { title: "Preserved", count: 42 },
      });

      interface UserState {
        value: string;
        setValue: (v: string) => void;
      }

      const store = createStore(
        mimic<TestSchema, undefined, UserState>(
          mockDocument as unknown as ClientDocument.ClientDocument<TestSchema>,
          (set) => ({
            value: "initial",
            setValue: (v: string) => set((state) => ({ ...state, value: v })),
          })
        )
      );

      expect(store.getState().mimic.snapshot).toEqual({ title: "Preserved", count: 42 });

      store.getState().setValue("updated");

      expect(store.getState().value).toBe("updated");
      expect(store.getState().mimic.snapshot).toEqual({ title: "Preserved", count: 42 });
    });
  });

  describe("Multiple Events", () => {
    it("should handle rapid successive events correctly", () => {
      const store = createStore(
        mimic(mockDocument as unknown as ClientDocument.ClientDocument<TestSchema>, () => ({}))
      );

      // Fire multiple events in quick succession
      for (let i = 0; i < 10; i++) {
        mockDocument._setState({ snapshot: { title: `Update ${i}`, count: i } });
        mockDocument._triggerStateChange();
      }

      expect(store.getState().mimic.snapshot).toEqual({ title: "Update 9", count: 9 });
    });

    it("should handle interleaved event types", () => {
      const store = createStore(
        mimic(mockDocument as unknown as ClientDocument.ClientDocument<TestSchema>, () => ({}))
      );

      mockDocument._setState({ isConnected: true });
      mockDocument._triggerConnectionChange();

      mockDocument._setState({ snapshot: { title: "New", count: 1 } });
      mockDocument._triggerStateChange();

      mockDocument._setState({ isReady: true });
      mockDocument._triggerReady();

      const state = store.getState().mimic;
      expect(state.isConnected).toBe(true);
      expect(state.snapshot).toEqual({ title: "New", count: 1 });
      expect(state.isReady).toBe(true);
    });
  });
});

// =============================================================================
// Type Export Tests (compile-time verification)
// =============================================================================

describe("Type Exports", () => {
  it("should export all expected types from index", async () => {
    // This test verifies that the types are properly exported
    // by importing them - if they're missing, TypeScript will error
    const exports = await import("../../src/zustand/index");

    expect(exports.mimic).toBeDefined();
    // Type exports are verified at compile time - if this file compiles,
    // the types are exported correctly
  });
});
