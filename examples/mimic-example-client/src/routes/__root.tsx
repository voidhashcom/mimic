import * as React from 'react'
import { Link, Outlet, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { servers, getServerType, setServerType, type ServerType } from '../lib/serverConfig'

export const Route = createRootRoute({
  component: RootComponent,
})

function ServerToggle() {
  const [currentServer, setCurrentServer] = React.useState<ServerType>(() => getServerType())

  const handleServerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newServer = e.target.value as ServerType
    setServerType(newServer)
    setCurrentServer(newServer)
    // Reload the page to reconnect with the new server
    window.location.reload()
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor="server-select" className="text-gray-600">
        Server:
      </label>
      <select
        id="server-select"
        value={currentServer}
        onChange={handleServerChange}
        className="border rounded px-2 py-1 bg-white text-gray-800 cursor-pointer hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {Object.values(servers).map((server) => (
          <option key={server.type} value={server.type}>
            {server.name} (:{server.port})
          </option>
        ))}
      </select>
    </div>
  )
}

function RootComponent() {
  return (
    <>
      <div className="p-2 flex gap-2 text-lg items-center justify-between">
        <div className="flex gap-2">
          <Link
            to="/"
            activeProps={{
              className: 'font-bold',
            }}
            activeOptions={{ exact: true }}
          >
            Home
          </Link>{' '}
          <Link
            to="/about"
            activeProps={{
              className: 'font-bold',
            }}
          >
            About
          </Link>
        </div>
        <ServerToggle />
      </div>
      <hr />
      <Outlet />
      <TanStackRouterDevtools position="bottom-right" />
    </>
  )
}
