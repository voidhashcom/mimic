import { useRef, useCallback, useEffect } from "react";
import { useSyncExternalStore } from "react";
import type { StoreApi } from "zustand";
import type { ClientDocument } from "@voidhash/mimic/client";
import type { Primitive } from "@voidhash/mimic";
import type { MimicSlice } from "./types";

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
  /** Runs an update on the active draft. Throws if no draft is active. */
  readonly update: (fn: (root: Primitive.InferProxy<TSchema>) => void) => void;
}

/**
 * React hook for managing a draft lifecycle with auto-cleanup on unmount.
 *
 * @param store - The zustand store containing the mimic slice
 * @returns Draft control methods
 */
export const useDraft = <
  TSchema extends Primitive.AnyPrimitive,
  TPresence extends import("@voidhash/mimic").Presence.AnyPresence | undefined = undefined,
>(
  store: StoreApi<MimicSlice<TSchema, TPresence>>
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
    draftRef.current = document.createDraft();
    bumpVersion();
  }, [store, bumpVersion]);

  const commit = useCallback(() => {
    if (draftRef.current === null) return;
    draftRef.current.commit();
    draftRef.current = null;
    bumpVersion();
  }, [bumpVersion]);

  const discard = useCallback(() => {
    if (draftRef.current === null) return;
    draftRef.current.discard();
    draftRef.current = null;
    bumpVersion();
  }, [bumpVersion]);

  const update = useCallback(
    (fn: (root: Primitive.InferProxy<TSchema>) => void) => {
      if (draftRef.current === null) {
        throw new Error("No active draft. Call begin() first.");
      }
      draftRef.current.update(fn);
    },
    []
  );

  // Auto-discard on unmount
  useEffect(() => {
    return () => {
      if (draftRef.current !== null) {
        try {
          draftRef.current.discard();
        } catch {
          // Draft may already be consumed
        }
        draftRef.current = null;
      }
    };
  }, []);

  return {
    draft: draftRef.current,
    begin,
    commit,
    discard,
    update,
  };
};
