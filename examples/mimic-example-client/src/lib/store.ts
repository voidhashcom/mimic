import { create } from "zustand";
import { mimic } from "@voidhash/mimic-react/zustand";
import { createDocument } from "./document";
import { commander } from "./commands";

/**
 * Kanban store with mimic integration and commander for undo/redo support.
 */
export const useTodoStore = create(
  commander.middleware(
    mimic(createDocument("1", { name: "John Doe" }), () => ({
      // Local browser state
      selectedCardId: null as string | null,
    }))
  )
);
