# @voidhash/mimic-effect

Effect-based server engine for real-time document collaboration using the Mimic CRDT system.

## Installation

```bash
pnpm add @voidhash/mimic-effect @voidhash/mimic effect @effect/platform
```

## Quick Start

```typescript
import { Effect, Layer } from "effect"
import { Primitive } from "@voidhash/mimic"
import {
  MimicServerEngine,
  ColdStorage,
  HotStorage,
  MimicAuthService,
} from "@voidhash/mimic-effect"

// Define your document schema
const TodoSchema = Primitive.Struct({
  title: Primitive.String().default(""),
  items: Primitive.Array(
    Primitive.Struct({
      text: Primitive.String(),
      completed: Primitive.Boolean().default(false),
    })
  ).default([]),
})

// Create the engine
const Engine = MimicServerEngine.make({
  schema: TodoSchema,
  initial: { title: "My Todo List" },
  basePath: "/mimic",
})

// Wire up with storage and auth
const MimicLive = Engine.pipe(
  Layer.provide(ColdStorage.InMemory.make()),
  Layer.provide(HotStorage.InMemory.make()),
  Layer.provide(MimicAuthService.NoAuth.make())
)

// Use in your HTTP server
const program = Effect.gen(function* () {
  const engine = yield* MimicServerEngine.Tag
  // Mount engine.routes in your HTTP server
  // e.g., with @effect/platform-bun or @effect/platform-node
})

program.pipe(Effect.provide(MimicLive), Effect.runPromise)
```

## Architecture

```
                        MimicServerEngine
                              |
          +-------------------+-------------------+
          |                   |                   |
    ColdStorage         HotStorage        MimicAuthService
    (Snapshots)           (WAL)           (Auth/Permissions)
          |                   |
          +-------------------+
                    |
            Document Storage
```

### Components

- **MimicServerEngine**: Main entry point that creates HTTP routes for WebSocket connections
- **ColdStorage**: Snapshot storage interface (for persisting document state)
- **HotStorage**: Write-ahead log storage (for transaction history)
- **MimicAuthService**: Authentication and authorization service
- **DocumentManager**: Internal service managing document lifecycle
- **PresenceManager**: Internal service managing ephemeral presence state

## Configuration

```typescript
const Engine = MimicServerEngine.make({
  // Required: Document schema
  schema: MySchema,

  // Optional: Initial state for new documents
  initial: { title: "Untitled" },
  // Or a function for dynamic initial state:
  // initial: ({ documentId }) => Effect.succeed({ title: documentId }),

  // Optional: Presence schema for cursor tracking, etc.
  presence: CursorPresence,

  // Optional: WebSocket route base path (default: "/mimic")
  basePath: "/mimic",

  // Optional: Document idle timeout before GC (default: 5 minutes)
  maxIdleTime: "10 minutes",

  // Optional: Max transaction history for deduplication (default: 1000)
  maxTransactionHistory: 500,

  // Optional: Snapshot configuration
  snapshot: {
    interval: "5 minutes",           // Time-based snapshot interval
    transactionThreshold: 100,       // Transaction count threshold
  },

  // Optional: Heartbeat configuration
  heartbeatInterval: "30 seconds",   // How often to ping
  heartbeatTimeout: "10 seconds",    // How long to wait for pong
})
```

## Storage Implementations

### In-Memory (Development/Testing)

```typescript
import { ColdStorage, HotStorage } from "@voidhash/mimic-effect"

const StorageLive = Layer.mergeAll(
  ColdStorage.InMemory.make(),
  HotStorage.InMemory.make()
)
```

### Custom Storage

```typescript
import { ColdStorage, HotStorage } from "@voidhash/mimic-effect"

// Implement ColdStorage interface
const PostgresColdStorage = Layer.effect(
  ColdStorage.Tag,
  Effect.gen(function* () {
    const db = yield* DatabaseService
    return {
      load: (documentId) => /* load from DB */,
      save: (documentId, doc) => /* save to DB */,
      delete: (documentId) => /* delete from DB */,
    }
  })
)

// Implement HotStorage interface
const RedisHotStorage = Layer.effect(
  HotStorage.Tag,
  Effect.gen(function* () {
    const redis = yield* RedisService
    return {
      getEntries: (documentId, sinceVersion) => /* get from Redis */,
      append: (documentId, entry) => /* append to Redis */,
      truncate: (documentId, upToVersion) => /* truncate in Redis */,
    }
  })
)
```

## Authentication

### No Authentication (Development)

```typescript
import { MimicAuthService } from "@voidhash/mimic-effect"

const AuthLive = MimicAuthService.NoAuth.make()
// All users get "write" permission as "anonymous"
```

### Static Permissions

```typescript
import { MimicAuthService } from "@voidhash/mimic-effect"

const AuthLive = MimicAuthService.Static.make({
  permissions: {
    "admin-token": "write",
    "viewer-token": "read",
  },
  defaultPermission: "read", // Optional fallback
})
```

### Custom Authentication

```typescript
import { MimicAuthService, AuthenticationError } from "@voidhash/mimic-effect"

const CustomAuth = MimicAuthService.make(
  Effect.gen(function* () {
    const jwt = yield* JwtService
    const db = yield* DatabaseService

    return {
      authenticate: (token, documentId) =>
        Effect.gen(function* () {
          // Verify JWT
          const payload = yield* jwt.verify(token).pipe(
            Effect.mapError(() => new AuthenticationError({ reason: "Invalid token" }))
          )

          // Check document permissions
          const permission = yield* db.getDocumentPermission(
            payload.userId,
            documentId
          )

          return {
            userId: payload.userId,
            permission, // "read" or "write"
          }
        }),
    }
  })
)
```

### Permissions

- `"read"`: Can subscribe, receive transactions, get snapshots
- `"write"`: All of the above, plus can submit transactions and set presence

## Presence

Enable presence tracking for features like cursor position, user status, etc.

```typescript
import { Schema } from "effect"
import { Presence } from "@voidhash/mimic"

// Define presence schema
const CursorPresence = Presence.make({
  schema: Schema.Struct({
    x: Schema.Number,
    y: Schema.Number,
    color: Schema.String,
    name: Schema.optional(Schema.String),
  }),
})

// Enable in engine config
const Engine = MimicServerEngine.make({
  schema: DocSchema,
  presence: CursorPresence,
})
```

## WebSocket Protocol

### Client -> Server Messages

```typescript
// Authentication
{ type: "auth", token: "user-token" }

// Heartbeat
{ type: "ping" }

// Submit transaction
{ type: "submit", transaction: EncodedTransaction }

// Request snapshot
{ type: "request_snapshot" }

// Set presence
{ type: "presence_set", data: { x: 100, y: 200 } }

// Clear presence
{ type: "presence_clear" }
```

### Server -> Client Messages

```typescript
// Authentication result
{ type: "auth_result", success: true, userId: "...", permission: "write" }
{ type: "auth_result", success: false, error: "Invalid token" }

// Heartbeat response
{ type: "pong" }

// Document snapshot
{ type: "snapshot", state: {...}, version: 42 }

// Transaction broadcast
{ type: "transaction", transaction: EncodedTransaction, version: 43 }

// Transaction error
{ type: "error", transactionId: "tx-123", reason: "..." }

// Presence snapshot (after auth)
{ type: "presence_snapshot", selfId: "conn-123", presences: {...} }

// Presence update
{ type: "presence_update", entries: { "conn-456": { data: {...}, userId: "..." } } }

// Presence removal
{ type: "presence_remove", connectionId: "conn-456" }
```

## Metrics

Built-in observability metrics using Effect's Metric API:

```typescript
import { MimicMetrics } from "@voidhash/mimic-effect"

// Connection metrics
MimicMetrics.connectionsActive    // Gauge: Current connections
MimicMetrics.connectionsTotal     // Counter: Total connections
MimicMetrics.connectionsDuration  // Histogram: Connection duration (ms)
MimicMetrics.connectionsErrors    // Counter: Connection errors

// Document metrics
MimicMetrics.documentsActive      // Gauge: Documents in memory
MimicMetrics.documentsCreated     // Counter: New documents
MimicMetrics.documentsRestored    // Counter: Restored from storage
MimicMetrics.documentsEvicted     // Counter: Evicted (idle GC)

// Transaction metrics
MimicMetrics.transactionsProcessed // Counter: Successful transactions
MimicMetrics.transactionsRejected  // Counter: Rejected transactions
MimicMetrics.transactionsLatency   // Histogram: Processing time (ms)

// Storage metrics
MimicMetrics.storageSnapshots      // Counter: Snapshots saved
MimicMetrics.storageSnapshotLatency // Histogram: Snapshot save time (ms)
MimicMetrics.storageWalAppends     // Counter: WAL entries written

// Presence metrics
MimicMetrics.presenceUpdates       // Counter: Presence updates
MimicMetrics.presenceActive        // Gauge: Active presences
```

## Integration Examples

### With @effect/platform-bun

```typescript
import { BunHttpServer, BunRuntime } from "@effect/platform-bun"
import { HttpRouter, HttpServer } from "@effect/platform"

const server = HttpServer.serve(engine.routes).pipe(
  Layer.provide(MimicLive),
  Layer.provide(BunHttpServer.layer({ port: 3000 }))
)

BunRuntime.runMain(Layer.launch(server))
```

### With @effect/platform-node

```typescript
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { HttpRouter, HttpServer } from "@effect/platform"

const server = HttpServer.serve(engine.routes).pipe(
  Layer.provide(MimicLive),
  Layer.provide(NodeHttpServer.layer({ port: 3000 }))
)

NodeRuntime.runMain(Layer.launch(server))
```

## Error Types

```typescript
import {
  ColdStorageError,
  HotStorageError,
  AuthenticationError,
  AuthorizationError,
  MissingDocumentIdError,
  MessageParseError,
  TransactionRejectedError,
} from "@voidhash/mimic-effect"
```

## License

MIT
