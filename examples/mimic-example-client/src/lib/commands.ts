/**
 * Kanban board commands using zustand-commander.
 *
 * This file defines all the commands for the Kanban board with undo/redo support.
 */

import { createCommander } from "@voidhash/mimic-react/zustand-commander";
import { CardNode, ColumnNode } from "@voidhash/mimic-example-shared";
import type { MimicSlice } from "@voidhash/mimic-react/zustand";
import type { MimicExampleSchema, PresenceSchema } from "@voidhash/mimic-example-shared";

// =============================================================================
// Helper Types
// =============================================================================

interface ColumnData {
  name: string;
}

interface CardData {
  title: string;
  description: string;
}

// =============================================================================
// Store Type
// =============================================================================

/**
 * The complete store state type.
 */
export type KanbanStoreState = MimicSlice<
  typeof MimicExampleSchema,
  typeof PresenceSchema
> & {
  // Local browser state
  selectedCardId: string | null;
};

// =============================================================================
// Commander
// =============================================================================

export const commander = createCommander<KanbanStoreState, typeof MimicExampleSchema>();

// =============================================================================
// Column Commands
// =============================================================================

/**
 * Add a new column to the board.
 * Undoable: removes the column on undo.
 */
export const addColumn = commander.undoableAction<{title: string}, { columnId: string }>(
  (ctx, params) => {
    let newColumnId: string | undefined;

    ctx.transaction((root) => {
      const rootNode = root.root();
      if (!rootNode) throw new Error("Tree has no root node");
      // insertLast returns the id string directly
      newColumnId = root.insertLast(rootNode.id, ColumnNode, {
        name: params.title,
      });
    });

    return { columnId: newColumnId! };
  },
  (ctx, _params, result) => {
    ctx.transaction((root) => {
      root.remove(result.columnId);
    });
  }
);

/**
 * Rename a column.
 * Undoable: restores the previous name on undo.
 */
export const renameColumn = commander.undoableAction<{columnId: string, title: string}, { previousTitle: string }>(
  (ctx, params) => {
    const { mimic } = ctx.getState();

    // Get the current name before changing
    // Cast to access the data property which is spread on the snapshot
    const column = mimic.snapshot?.children.find(
      (c) => c.id === params.columnId
    ) as { name?: string } | undefined;
    const previousTitle = column?.name ?? "";

    ctx.transaction((root) => {
      root.at(params.columnId, ColumnNode).name.set(params.title);
    });

    return { previousTitle };
  },
  (ctx, params, result) => {
    ctx.transaction((root) => {
      root.at(params.columnId, ColumnNode).name.set(result.previousTitle);
    });
  }
);

/**
 * Delete a column.
 * Undoable: restores the column with all its cards on undo.
 */
export const deleteColumn = commander.undoableAction<{columnId: string}, { columnData: { name: string; cards: { title: string; description: string }[] } | null, columnIndex: number }>(
  (ctx, params) => {
    const { mimic } = ctx.getState();

    // Capture the column state before deletion for undo
    const column = mimic.snapshot?.children.find(
      (c) => c.id === params.columnId
    );

    // Cast to access the typed data
    const typedColumn = column as
      | { name: string; children: Array<{ title: string; description: string }> }
      | undefined;

    const columnData = typedColumn
      ? {
          name: typedColumn.name,
          cards: typedColumn.children.map((card) => ({
            title: card.title,
            description: card.description,
          })),
        }
      : null;

    // Get the index for restoration
    const columnIndex =
      mimic.snapshot?.children.findIndex((c) => c.id === params.columnId) ?? -1;

    ctx.transaction((root) => {
      root.remove(params.columnId);
    });

    return { columnData, columnIndex };
  },
  (ctx, _params, result) => {
    const { columnData } = result;
    if (!columnData) return;

    ctx.transaction((root) => {
      const rootNode = root.root();
      if (!rootNode) throw new Error("Tree has no root node");

      // Re-create the column
      const newColumnId = root.insertAt(
        rootNode.id,
        result.columnIndex,
        ColumnNode,
        { name: columnData.name }
      );

      // Re-create all cards
      for (const card of columnData.cards) {
        root.insertLast(newColumnId, CardNode, {
          title: card.title,
          description: card.description,
        });
      }
    });
  }
);

// =============================================================================
// Card Commands
// =============================================================================

/**
 * Add a new card to a column.
 * Undoable: removes the card on undo.
 */
export const addCard = commander.undoableAction<{columnId: string, title: string, description?: string}, { cardId: string }>(
  (ctx, params) => {
    let newCardId: string | undefined;

    ctx.transaction((root) => {
      // insertLast returns the id string directly
      newCardId = root.insertLast(params.columnId, CardNode, {
        title: params.title,
        description: params.description ?? "",
      });
    });

    return { cardId: newCardId! };
  },
  (ctx, _params, result) => {
    ctx.transaction((root) => {
      root.remove(result.cardId);
    });
  }
);

/**
 * Update a card's title and description.
 * Undoable: restores the previous values on undo.
 */
export const updateCard = commander.undoableAction<{cardId: string, title: string, description?: string}, { previousTitle: string, previousDescription: string }>(
  (ctx, params) => {
    const { mimic } = ctx.getState();

    // Find the card to get previous values
    let previousTitle = "";
    let previousDescription = "";

    for (const column of mimic.snapshot?.children ?? []) {
      // Cast children to access typed properties (via unknown for safe casting)
      const typedChildren = column.children as unknown as Array<{
        id: string;
        title: string;
        description: string;
      }>;
      const card = typedChildren.find((c) => c.id === params.cardId);
      if (card) {
        previousTitle = card.title;
        previousDescription = card.description;
        break;
      }
    }

    ctx.transaction((root) => {
      root.at(params.cardId, CardNode).title.set(params.title);
      root.at(params.cardId, CardNode).description.set(params.description ?? "");
    });

    return { previousTitle, previousDescription };
  },
  (ctx, params, result) => {
    ctx.transaction((root) => {
      root.at(params.cardId, CardNode).title.set(result.previousTitle);
      root
        .at(params.cardId, CardNode)
        .description.set(result.previousDescription);
    });
  }
);

/**
 * Delete a card.
 * Undoable: restores the card at its original position on undo.
 */
export const deleteCard = commander.undoableAction<{cardId: string}, { cardData: { title: string; description: string } | null, columnId: string | null, cardIndex: number }>(
  (ctx, params) => {
    const { mimic } = ctx.getState();

    // Find the card and its column to capture state for undo
    let cardData: { title: string; description: string } | null = null;
    let columnId: string | null = null;
    let cardIndex = -1;

    for (const column of mimic.snapshot?.children ?? []) {
      // Cast children to access typed properties (via unknown for safe casting)
      const typedChildren = column.children as unknown as Array<{
        id: string;
        title: string;
        description: string;
      }>;
      const index = typedChildren.findIndex((c) => c.id === params.cardId);
      if (index !== -1) {
        const card = typedChildren[index];
        if (card) {
          cardData = {
            title: card.title,
            description: card.description,
          };
          columnId = column.id;
          cardIndex = index;
        }
        break;
      }
    }

    ctx.transaction((root) => {
      root.remove(params.cardId);
    });

    return { cardData, columnId, cardIndex };
  },
  (ctx, _params, result) => {
    if (!result.cardData || !result.columnId) return;

    ctx.transaction((root) => {
      root.insertAt(result.columnId!, result.cardIndex, CardNode, {
        title: result.cardData!.title,
        description: result.cardData!.description,
      });
    });
  }
);

/**
 * Move a card to a different position or column.
 * Undoable: moves the card back to its original position on undo.
 */
export const moveCard = commander.undoableAction<{cardId: string, destinationColumnId: string, destinationIndex: number}, { sourceColumnId: string | null, sourceIndex: number }>(
  (ctx, params) => {
    const { mimic } = ctx.getState();

    // Find current position for undo
    let sourceColumnId: string | null = null;
    let sourceIndex = -1;

    for (const column of mimic.snapshot?.children ?? []) {
      const index = column.children.findIndex((c) => c.id === params.cardId);
      if (index !== -1) {
        sourceColumnId = column.id;
        sourceIndex = index;
        break;
      }
    }

    ctx.transaction((root) => {
      root.move(params.cardId, params.destinationColumnId, params.destinationIndex);
    });

    return { sourceColumnId: sourceColumnId!, sourceIndex };
  },
  (ctx, params, result) => {
    ctx.transaction((root) => {
      root.move(params.cardId, result.sourceColumnId, result.sourceIndex);
    });
  }
);

// =============================================================================
// Column Reorder Command
// =============================================================================

/**
 * Reorder a column to a new position.
 * Undoable: moves the column back to its original position on undo.
 */
export const reorderColumn = commander.undoableAction<{columnId: string, destinationIndex: number}, { sourceIndex: number }>(
  (ctx, params) => {
    const { mimic } = ctx.getState();

    // Find current index for undo
    const sourceIndex =
      mimic.snapshot?.children.findIndex((c) => c.id === params.columnId) ?? -1;

    ctx.transaction((root) => {
      const rootNode = root.root();
      if (!rootNode) throw new Error("Root node not found");
      root.move(params.columnId, rootNode.id, params.destinationIndex);
    });

    return { sourceIndex };
  },
  (ctx, params, result) => {
    ctx.transaction((root) => {
      const rootNode = root.root();
      if (!rootNode) throw new Error("Root node not found");
      root.move(params.columnId, rootNode.id, result.sourceIndex);
    });
  }
);

// =============================================================================
// Selection Commands (non-undoable, local state only)
// =============================================================================

/**
 * Select a card (local state only, not synced).
 */
export const selectCard = commander.action<{cardId: string | null}>(
  (ctx, params) => {
    ctx.setState({ selectedCardId: params.cardId });
  }
);
