
import { createContext, useContext, type ReactNode } from 'react'
import type { KanbanState } from '../types/kanban'
import { BoardNode, CardNode, ColumnNode } from '@voidhash/mimic-example-shared'
import { Primitive } from '@voidhash/mimic'
import { useTodoStore } from '../lib/store'

// Generate unique IDs
const generateId = () => crypto.randomUUID()

// Initial state with some sample data
const initialState: KanbanState = {
  columns: {
    'column-1': { id: 'column-1', title: 'To Do', cardIds: ['card-1', 'card-2'] },
    'column-2': { id: 'column-2', title: 'In Progress', cardIds: ['card-3'] },
    'column-3': { id: 'column-3', title: 'Done', cardIds: ['card-4'] },
  },
  cards: {
    'card-1': { id: 'card-1', title: 'Research competitors', description: 'Analyze top 5 competitors in the market' },
    'card-2': { id: 'card-2', title: 'Design mockups', description: 'Create initial UI mockups for the dashboard' },
    'card-3': { id: 'card-3', title: 'Setup project', description: 'Initialize the repository and configure tooling' },
    'card-4': { id: 'card-4', title: 'Define requirements', description: 'Document all functional requirements' },
  },
  columnOrder: ['column-1', 'column-2', 'column-3'],
}


interface KanbanContextValue {
  state: Primitive.TreeNodeSnapshot<typeof BoardNode> | undefined
  addColumn: (title: string) => void
  renameColumn: (columnId: string, title: string) => void
  deleteColumn: (columnId: string) => void
  addCard: (columnId: string, title: string, description?: string) => void
  updateCard: (cardId: string, title: string, description?: string) => void
  deleteCard: (cardId: string, columnId: string) => void
  moveCard: (
    cardId: string,
    sourceColumnId: string,
    destinationColumnId: string,
    sourceIndex: number,
    destinationIndex: number
  ) => void
  reorderColumns: (columnId: string, destinationIndex: number) => void
}

const KanbanContext = createContext<KanbanContextValue | null>(null)

export function KanbanProvider({ children }: { children: ReactNode }) {
  // const liveDocument = useDocument(document);
  const store = useTodoStore();

  const addColumn = (title: string) => {
    store.mimic.document.transaction((root) => {
      // Get the root node id - root.root() returns the root node state
      const rootNode = root.root()
      if (!rootNode) throw new Error('Tree has no root node')
      root.insertLast(rootNode.id, ColumnNode, { name: title })
    })
  }

  const renameColumn = (columnId: string, title: string) => {
    store.mimic.document.transaction((root) => {
      root.at(columnId, ColumnNode).name.set(title)
    })
  }

  const deleteColumn = (columnId: string) => {
    store.mimic.document.transaction((root) => {
      root.remove(columnId)
    })
  }

  const addCard = (columnId: string, title: string, description?: string) => {
    store.mimic.document.transaction((root) => {
      const columnNode = root.at(columnId, ColumnNode)
      if (!columnNode) throw new Error('Column node not found')
      root.insertLast(columnId, CardNode, { title, description: description ?? '' })
    })
    
  }

  const updateCard = (cardId: string, title: string, description?: string) => {
    store.mimic.document.transaction((root) => {
      root.at(cardId, CardNode).title.set(title)
      root.at(cardId, CardNode).description.set(description ?? '')
    })
  }

  const deleteCard = (cardId: string) => {
    store.mimic.document.transaction((root) => {
      root.remove(cardId)
    })
  }

  const moveCard = (
    cardId: string,
    sourceColumnId: string,
    destinationColumnId: string,
    sourceIndex: number,
    destinationIndex: number
  ) => {
    store.mimic.document.transaction((root) => {
      root.move(cardId, destinationColumnId, destinationIndex)
    })
  }

  const reorderColumns = (columnId: string, destinationIndex: number) => {
    store.mimic.document.transaction((root) => {
      const rootNode = root.root()
      if (!rootNode) throw new Error('Root node not found')
      root.move(columnId, rootNode.id, destinationIndex)
    });
  }

  return (
    <KanbanContext.Provider
      value={{
        state: store.mimic.snapshot,
        addColumn,
        renameColumn,
        deleteColumn,
        addCard,
        updateCard,
        deleteCard,
        moveCard,
        reorderColumns,
      }}
    >
      {children}
    </KanbanContext.Provider>
  )
}

export function useKanban() {
  const context = useContext(KanbanContext)
  if (!context) {
    throw new Error('useKanban must be used within a KanbanProvider')
  }
  return context
}
