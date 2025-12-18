# Mimic

A collaborative document synchronization system built with TypeScript and Effect. Mimic provides real-time, conflict-free synchronization for structured documents with type-safe schemas and optimistic updates.

## Features

- **Transactional Operations** - All changes are atomic and reversible
- **Conflict-Free Synchronization** - Operational Transformation (OT) ensures consistent state across clients
- **Type-Safe Schemas** - Define document structures with TypeScript primitives
- **Proxy-Based API** - Mutate documents through a type-safe proxy interface
- **Optimistic Updates** - Immediate local updates with automatic server synchronization
- **Real-Time Sync** - WebSocket-based bidirectional communication
- **Fractional Indexing** - Efficient array ordering without global sequence numbers
- **Effect-Based Architecture** - Functional programming with comprehensive error handling

## Installation

Mimic requires [Bun](https://bun.sh) as the runtime. Install dependencies:

```bash
bun install
```

### Package Installation

Install the core library:

```bash
bun add @voidhash/mimic
```

Install the Effect-based server:

```bash
bun add @voidhash/mimic-effect
```

## Quick Start

### Define a Schema

Start by defining your document schema using Mimic's primitive types:

```typescript
import { Primitive } from "@voidhash/mimic";

const TodoSchema = Primitive.Struct({
  title: Primitive.String().default(""),
  completed: Primitive.Boolean().default(false),
  items: Primitive.Array(
    Primitive.Struct({
      name: Primitive.String(),
      done: Primitive.Boolean().default(false),
    })
  ),
});

type TodoState = Primitive.InferState<typeof TodoSchema>;
```

### Client Usage

Create a client document with optimistic updates:

```typescript
import { ClientDocument, WebSocketTransport } from "@voidhash/mimic/client";
import { TodoSchema } from "./schema";

// Create a WebSocket transport
const transport = WebSocketTransport.make({
  url: "ws://localhost:3000",
  documentId: "my-document-id",
  onConnectionChange: (connected) => {
    console.log("Connection:", connected ? "connected" : "disconnected");
  },
});

// Create the client document
const client = ClientDocument.make({
  schema: TodoSchema,
  transport,
  onStateChange: (state) => {
    console.log("State updated:", state);
  },
});

// Connect to the server
await client.connect();

// Make changes within a transaction
client.transaction((root) => {
  root.title.set("My Todo List");
  root.items.push({
    name: "Buy groceries",
    done: false,
  });
});
```

### Server Setup

Set up a Mimic server using Effect:

```typescript
import { Effect } from "effect";
import { MimicServer } from "@voidhash/mimic-effect";
import { NodeSocketServer } from "@effect/platform-node/NodeSocketServer";
import { SocketServer } from "@effect/platform/SocketServer";
import type * as Socket from "@effect/platform/Socket";
import { Primitive } from "@voidhash/mimic";

// Define your document schema
const TodoSchema = Primitive.Struct({
  title: Primitive.String().default(""),
  completed: Primitive.Boolean().default(false),
  items: Primitive.Array(
    Primitive.Struct({
      name: Primitive.String(),
      done: Primitive.Boolean().default(false),
    })
  ),
});

// Create the server layer
const serverLayer = MimicServer.layer({
  schemas: {
    todo: TodoSchema,
  },
});

// Extract document path from socket (implementation depends on your socket server)
const extractPath = (socket: Socket.Socket): Effect.Effect<string> => {
  // Extract path from socket - this is implementation-specific
  // For example, you might get it from socket.path or socket.url
  return Effect.succeed(socket.path || "/doc/default");
};

// Run the server
Effect.gen(function* () {
  const handler = yield* MimicServer.MimicWebSocketHandler;
  const server = yield* SocketServer;

  yield* server.run((socket) =>
    Effect.gen(function* () {
      const path = yield* extractPath(socket);
      yield* handler(socket, path);
    }).pipe(Effect.catchAll((error) => Effect.logError("Connection error", error)))
  );
}).pipe(
  Effect.provide(serverLayer),
  Effect.provide(NodeSocketServer.layer({ port: 3000 })),
  Effect.runPromise
);
```

## Architecture

Mimic uses a client-server architecture with the following components:

### Document Model

Documents are defined by schemas built from primitives:
- **String** - Text values
- **Number** - Numeric values
- **Boolean** - Boolean values
- **Struct** - Object structures with named fields
- **Array** - Ordered collections with fractional indexing
- **Union** - Tagged union types (discriminated unions)
- **Literal** - Fixed literal values

### Transaction Flow

1. **Local Transaction** - Client makes changes within a transaction
2. **Optimistic Update** - Changes are immediately applied locally
3. **Send to Server** - Transaction is sent to the server via WebSocket
4. **Server Processing** - Server validates and applies the transaction
5. **Broadcast** - Server broadcasts the transaction to all connected clients
6. **Rebase** - Clients rebase pending transactions against incoming changes

### Conflict Resolution

Mimic uses Operational Transformation (OT) to resolve conflicts:

- **Path-Based Transformation** - Operations are transformed based on their paths
- **Primitive-Aware** - Each primitive type knows how to transform its operations
- **Automatic Rebasing** - Pending transactions are automatically rebased against server changes
- **Last-Write-Wins** - For certain conflicts, the client's intent takes precedence

### Fractional Indexing

Arrays use fractional indexing for efficient ordering:

- No global sequence numbers required
- Insertions can happen concurrently without conflicts
- Positions are represented as fractional strings between elements

## Packages

This monorepo contains the following packages:

### `@voidhash/mimic`

Core synchronization primitives and operations.

**Exports:**
- `Primitive` - Schema definition primitives
- `Document` - Local document management
- `Transaction` - Transaction types and utilities
- `Operation` - Operation types and definitions
- `OperationPath` - Path utilities for operations
- `ProxyEnvironment` - Proxy environment for mutations
- `Transform` - Operational transformation utilities

**Client Exports:**
- `ClientDocument` - Optimistic client document with server sync
- `WebSocketTransport` - WebSocket transport implementation
- `Transport` - Transport interface
- `Rebase` - Transaction rebasing logic
- `StateMonitor` - State monitoring utilities

**Server Exports:**
- `ServerDocument` - Server-side document management

### `@voidhash/mimic-effect`

Effect-based server implementation with WebSocket support.

**Exports:**
- `MimicServer` - Server layer composition
- `MimicConfig` - Server configuration
- `DocumentManager` - Document lifecycle management
- `DocumentProtocol` - WebSocket protocol definitions
- `WebSocketHandler` - WebSocket connection handler

## Examples

See the [examples](./examples/) directory for complete examples:

- [Client Example](./examples/mimic-client-example/) - Basic client usage with WebSocket transport

## Development

### Prerequisites

- [Bun](https://bun.sh) (latest version)
- TypeScript 5.x

### Setup

```bash
# Install dependencies
bun install

# Run type checking
bun run typecheck

# Run linting
bun run lint

# Run tests
bun test

# Build all packages
bun run build
```

### Project Structure

```
.
├── packages/
│   ├── mimic/              # Core synchronization library
│   ├── mimic-effect/       # Effect-based server implementation
│   └── tsconfig/           # Shared TypeScript configurations
├── examples/               # Example implementations
└── .github/                # GitHub templates and workflows
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Development Guidelines

- Follow the existing code style
- Use Effect for all async operations
- Write tests for new features
- Ensure type safety (no `any` types)
- Update documentation as needed

### Reporting Issues

Please use the [GitHub issue tracker](https://github.com/voidhashcom/mimic/issues) to report bugs or request features. When reporting bugs, please include:

- A clear description of the issue
- Steps to reproduce
- Expected vs actual behavior
- Version information

## License

[License information to be added]

## Links

- [Repository](https://github.com/voidhashcom/mimic)
- [Documentation](./ARCHITECTURE.md)
- [Effect](https://effect.website/)
- [Bun](https://bun.sh)
