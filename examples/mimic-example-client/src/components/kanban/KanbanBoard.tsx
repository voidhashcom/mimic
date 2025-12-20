import * as React from 'react'
import { useState, useMemo } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from '@dnd-kit/core'
import { SortableContext, horizontalListSortingStrategy, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { Column, ColumnOverlay } from './Column'
import { CardOverlay } from './Card'
import { AddColumnForm } from './AddColumnForm'
import { EditCardModal } from './EditCardModal'
import { useKanban } from '../../context/KanbanContext'
import type { Card as CardType, Column as ColumnType } from '../../types/kanban'
import { useTodoStore } from '../../lib/store'

export function KanbanBoard() {
  const { state, moveCard, reorderColumns } = useKanban()
  const [activeId, setActiveId] = useState<string | null>(null)
  const [activeType, setActiveType] = useState<'card' | 'column' | null>(null)
  const [editingCard, setEditingCard] = useState<{ card: CardType; columnId: string } | null>(null)
  const { mimic } = useTodoStore()

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const columns = useMemo(() => {
    return state?.children
  }, [state?.children])

  const allCards = useMemo(() => {
    return state?.children.flatMap((child) => child.children ?? []) ?? []
  }, [state?.children])

  const activeCard = useMemo(() => {
    if (activeType === 'card' && activeId) {
      return allCards?.find((card) => card.id === activeId)
    }
    return null
  }, [activeType, activeId, allCards])

  const allColumns = useMemo(() => {
    return state?.children ?? []
  }, [state?.children])

  const activeColumn = useMemo(() => {
    if (activeType === 'column' && activeId) {
      return allColumns?.find((column) => column.id === activeId)
    }
    return null
  }, [activeType, activeId, allColumns])

  const activeColumnCards = useMemo(() => {
    if (activeColumn) {
      return activeColumn.children ?? []
    }
    return []
  }, [activeColumn])

  function findColumnByCardId(cardId: string): string | null {
    for (const column of allColumns) {
      if (column.children?.some((child) => child.id === cardId)) {
        return column.id
      }
    }
    return null
  }

  function handleDragStart(event: DragStartEvent) {
    const { active } = event
    const type = active.data.current?.type as 'card' | 'column' | undefined

    if (type === 'card') {
      setActiveId(active.id as string)
      setActiveType('card')
    } else if (type === 'column') {
      setActiveId(active.id as string)
      setActiveType('column')
    }
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event
    if (!over) return

    const activeType = active.data.current?.type
    const overType = over.data.current?.type

    // Only handle card movements during drag over
    if (activeType !== 'card') return

    const activeCardId = active.id as string
    const sourceColumnId = findColumnByCardId(activeCardId)
    if (!sourceColumnId) return

    let destinationColumnId: string | null = null

    if (overType === 'card') {
      // Dragging over another card
      destinationColumnId = findColumnByCardId(over.id as string)
    } else if (overType === 'column' || over.id.toString().startsWith('column-droppable-')) {
      // Dragging over a column or its drop zone
      destinationColumnId = over.data.current?.columnId || over.id.toString().replace('column-droppable-', '')
    }

    if (!destinationColumnId || sourceColumnId === destinationColumnId) return

    // Move card to new column
    const sourceColumn = allColumns?.find((column) => column.id === sourceColumnId)
    const destinationColumn = allColumns?.find((column) => column.id === destinationColumnId)
    if (!sourceColumn || !destinationColumn) return

    const sourceIndex = sourceColumn?.children?.findIndex((child) => child.id === activeCardId) ?? -1
    let destinationIndex = destinationColumn?.children?.length ?? 0

    if (overType === 'card') {
      destinationIndex = destinationColumn?.children?.findIndex((child) => child.id === over.id as string) ?? -1
    }

    moveCard(activeCardId, sourceColumnId, destinationColumnId, sourceIndex, destinationIndex)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event

    setActiveId(null)
    setActiveType(null)

    if (!over) return

    const activeType = active.data.current?.type

    if (activeType === 'column') {
      // Reorder columns
      if (active.id !== over.id) {
        const sourceIndex = allColumns?.findIndex((column) => column.id === active.id as string) ?? -1
        const destinationIndex = allColumns?.findIndex((column) => column.id === over.id as string) ?? -1

        if (sourceIndex !== -1 && destinationIndex !== -1) {
          reorderColumns(active.id as string, destinationIndex)
        }
      }
    } else if (activeType === 'card') {
      // Handle card reordering within the same column
      const activeCardId = active.id as string
      const sourceColumnId = findColumnByCardId(activeCardId)
      if (!sourceColumnId) return

      const overType = over.data.current?.type

      if (overType === 'card') {
        const overCardId = over.id as string
        const destinationColumnId = findColumnByCardId(overCardId)

        if (destinationColumnId && sourceColumnId === destinationColumnId) {
          const column = allColumns?.find((column) => column.id === sourceColumnId)
          if (!column) return

          const sourceIndex = column?.children?.findIndex((child) => child.id === activeCardId) ?? -1
          const destinationIndex = column?.children?.findIndex((child) => child.id === overCardId) ?? -1

          if (sourceIndex !== destinationIndex) {
            moveCard(activeCardId, sourceColumnId, destinationColumnId, sourceIndex, destinationIndex)
          }
        }
      }
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Kanban Board</h1>
        <pre>{JSON.stringify({isConnected: mimic.isConnected, isReady: mimic.isReady}, null, 2)}</pre>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex-1 overflow-x-auto p-4">
          <div className="flex gap-4 h-full items-start">
            <SortableContext items={allColumns?.map((column) => column.id) ?? []} strategy={horizontalListSortingStrategy}>
              {allColumns?.map((column) => {
                const cards = column.children ?? []

                return (
                  <Column
                    key={column.id}
                    column={column}
                    cards={cards}
                    onCardClick={(card) => setEditingCard({ card, columnId: column.id })}
                  />
                )
              })}
            </SortableContext>

            <AddColumnForm />
          </div>
        </div>

        <DragOverlay>
          {activeCard && <CardOverlay card={activeCard} />}
          {activeColumn && <ColumnOverlay column={activeColumn} cards={activeColumnCards} />}
        </DragOverlay>
      </DndContext>

      {editingCard && (
        <EditCardModal
          card={editingCard.card}
          columnId={editingCard.columnId}
          onClose={() => setEditingCard(null)}
        />
      )}
    </div>
  )
}
