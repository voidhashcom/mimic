import { useRef, useCallback, useEffect } from "react";
import { useSyncExternalStore } from "react";
import type { StoreApi } from "zustand";
import type { ClientDocument } from "@voidhash/mimic/client";
import type { Primitive } from "@voidhash/mimic";
import type { MimicSlice } from "./types";
import type { CommanderSlice } from "../zustand-commander/types";
import { setActiveDraft, clearActiveDraft } from "../zustand-commander/commander";

/**
 * Return type of the useDraft hook.
 */
export interface UseDraftReturn<TSchema extends Primitive.AnyPrimitive> {
  /** The active draft handle, or null if no draft is active */
  readonly draft: ClientDocument.DraftHandle<TSchema> | null;
  /** Creates a new draft. Throws if a draft is already active. */
  readonly begin: () => void;
  /** Commits the active draft. No-op if no draft is active. */
  readonly commit: () => void;
  /** Discards the active draft. No-op if no draft is active. */
  readonly discard: () => void;
}

/**
 * React hook for managing a draft lifecycle with auto-cleanup on unmount.
 * Links the draft to the commander so that `ctx.transaction()` routes through the draft
 * and undo/redo is disabled while the draft is active.
 *
 * @param store - The zustand store containing the mimic slice and commander slice
 * @returns Draft control methods
 */
export const useDraft = <
  TSchema extends Primitive.AnyPrimitive,
  TPresence extends import("@voidhash/mimic").Presence.AnyPresence | undefined = undefined,
>(
  store: StoreApi<MimicSlice<TSchema, TPresence> & CommanderSlice>
): UseDraftReturn<TSchema> => {
  const draftRef = useRef<ClientDocument.DraftHandle<TSchema> | null>(null);
  // Use a counter to force re-renders when draft state changes
  const versionRef = useRef(0);

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      // We piggyback on the zustand store subscription to know when drafts change
      return store.subscribe(onStoreChange);
    },
    [store]
  );

  const getSnapshot = useCallback(() => {
    return versionRef.current;
  }, []);

  useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const bumpVersion = useCallback(() => {
    versionRef.current++;
  }, []);

  const begin = useCallback(() => {
    if (draftRef.current !== null) {
      throw new Error("A draft is already active. Commit or discard it first.");
    }
    const document = store.getState().mimic.document;
    const draft = document.createDraft();
    draftRef.current = draft;
    setActiveDraft(store, draft);
    bumpVersion();
  }, [store, bumpVersion]);

  const commit = useCallback(() => {
    if (draftRef.current === null) return;
    clearActiveDraft(store);
    draftRef.current.commit();
    draftRef.current = null;
    bumpVersion();
  }, [store, bumpVersion]);

  const discard = useCallback(() => {
    if (draftRef.current === null) return;
    clearActiveDraft(store);
    draftRef.current.discard();
    draftRef.current = null;
    bumpVersion();
  }, [store, bumpVersion]);

  // Auto-discard on unmount
  useEffect(() => {
    return () => {
      if (draftRef.current !== null) {
        try {
          clearActiveDraft(store);
          draftRef.current.discard();
        } catch {
          // Draft may already be consumed
        }
        draftRef.current = null;
      }
    };
  }, [store]);

  return {
    draft: draftRef.current,
    begin,
    commit,
    discard,
  };
};
