import { createFileRoute } from '@tanstack/react-router'
import * as React from 'react'
import { KanbanProvider } from '../context/KanbanContext'
import { KanbanBoard } from '../components/kanban'

export const Route = createFileRoute('/')({
  component: HomeComponent,
})

function HomeComponent() {
  return (
    <KanbanProvider>
      <div className="h-[calc(100vh-60px)]">
        <KanbanBoard />
      </div>
    </KanbanProvider>
  )
}
