import { createContext, useContext, type ReactNode } from "react";
import { BoardNode } from "@voidhash/mimic-example-shared";
import type { Primitive } from "@voidhash/mimic";
import { useTodoStore } from "../lib/store";
import { useCommander } from "@voidhash/mimic-react/zustand-commander";
import {
  addColumn,
  renameColumn,
  deleteColumn,
  addCard,
  updateCard,
  deleteCard,
  moveCard,
  reorderColumn,
} from "../lib/commands";

interface KanbanContextValue {
  state: Primitive.TreeNodeSnapshot<typeof BoardNode> | undefined;
  addColumn: (title: string) => void;
  renameColumn: (columnId: string, title: string) => void;
  deleteColumn: (columnId: string) => void;
  addCard: (columnId: string, title: string, description?: string) => void;
  updateCard: (cardId: string, title: string, description?: string) => void;
  deleteCard: (cardId: string, columnId: string) => void;
  moveCard: (
    cardId: string,
    sourceColumnId: string,
    destinationColumnId: string,
    sourceIndex: number,
    destinationIndex: number
  ) => void;
  reorderColumns: (columnId: string, destinationIndex: number) => void;
}

const KanbanContext = createContext<KanbanContextValue | null>(null);

export function KanbanProvider({ children }: { children: ReactNode }) {
  const store = useTodoStore();
  const dispatch = useCommander(useTodoStore);

  const handleAddColumn = (title: string) => {
    dispatch(addColumn)({ title });
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    dispatch(renameColumn)({ columnId, title });
  };

  const handleDeleteColumn = (columnId: string) => {
    dispatch(deleteColumn)({ columnId });
  };

  const handleAddCard = (
    columnId: string,
    title: string,
    description?: string
  ) => {
    dispatch(addCard)({ columnId, title, description });
  };

  const handleUpdateCard = (
    cardId: string,
    title: string,
    description?: string
  ) => {
    dispatch(updateCard)({ cardId, title, description });
  };

  const handleDeleteCard = (cardId: string, _columnId: string) => {
    // columnId is kept for interface compatibility but not needed by the command
    dispatch(deleteCard)({ cardId });
  };

  const handleMoveCard = (
    cardId: string,
    _sourceColumnId: string,
    destinationColumnId: string,
    _sourceIndex: number,
    destinationIndex: number
  ) => {
    dispatch(moveCard)({ cardId, destinationColumnId, destinationIndex });
  };

  const handleReorderColumns = (columnId: string, destinationIndex: number) => {
    dispatch(reorderColumn)({ columnId, destinationIndex });
  };

  return (
    <KanbanContext.Provider
      value={{
        state: store.mimic.snapshot,
        addColumn: handleAddColumn,
        renameColumn: handleRenameColumn,
        deleteColumn: handleDeleteColumn,
        addCard: handleAddCard,
        updateCard: handleUpdateCard,
        deleteCard: handleDeleteCard,
        moveCard: handleMoveCard,
        reorderColumns: handleReorderColumns,
      }}
    >
      {children}
    </KanbanContext.Provider>
  );
}

export function useKanban() {
  const context = useContext(KanbanContext);
  if (!context) {
    throw new Error("useKanban must be used within a KanbanProvider");
  }
  return context;
}
