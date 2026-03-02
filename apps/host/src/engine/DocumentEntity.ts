import {
  Duration,
  Effect,
  HashMap,
  PubSub,
  Ref,
  Schedule,
  Schema,
} from "effect";
import { Entity } from "effect/unstable/cluster";
import { Rpc } from "effect/unstable/rpc";
import { type Primitive, Transaction, Document } from "@voidhash/mimic";
import { ServerDocument } from "@voidhash/mimic/server";
import { SchemaJSON } from "@voidhash/mimic";
import { CollectionRepositoryTag } from "../mysql/CollectionRepository";
import { DocumentRepositoryTag } from "../mysql/DocumentRepository";
import {
  makeMysqlColdStorage,
  makeMysqlHotStorage,
  type ColdStorage,
  type HotStorage,
  type StoredDocument,
  type WalEntry,
} from "./Storage";
import type * as Protocol from "./Protocol";
import type { PresenceEntry } from "./Protocol";
import type { PresenceEvent } from "./Presence";

// RPC Schemas

const EncodedTransactionSchema = Schema.Struct({
  id: Schema.String,
  ops: Schema.Array(Schema.Unknown),
});

const SubmitResultSchema = Schema.Union([
  Schema.Struct({
    success: Schema.Literal(true),
    version: Schema.Number,
  }),
  Schema.Struct({
    success: Schema.Literal(false),
    reason: Schema.String,
  }),
]);

const SnapshotResponseSchema = Schema.Struct({
  state: Schema.Unknown,
  version: Schema.Number,
});

const PresenceEntrySchema = Schema.Struct({
  data: Schema.Unknown,
  userId: Schema.optional(Schema.String),
});

const PresenceSnapshotResponseSchema = Schema.Struct({
  presences: Schema.Record(Schema.String, PresenceEntrySchema),
});

// Entity Definition

export const MimicDocumentEntity = Entity.make("MimicDocument", [
  Rpc.make("Submit", {
    payload: { transaction: EncodedTransactionSchema },
    success: SubmitResultSchema,
  }),

  Rpc.make("GetSnapshot", {
    success: SnapshotResponseSchema,
  }),

  Rpc.make("GetTreeSnapshot", {
    success: Schema.Unknown,
  }),

  Rpc.make("Touch", {
    success: Schema.Void,
  }),

  Rpc.make("SetPresence", {
    payload: {
      connectionId: Schema.String,
      entry: PresenceEntrySchema,
    },
    success: Schema.Void,
  }),

  Rpc.make("RemovePresence", {
    payload: { connectionId: Schema.String },
    success: Schema.Void,
  }),

  Rpc.make("GetPresenceSnapshot", {
    success: PresenceSnapshotResponseSchema,
  }),
]);

// Submit Result type

export type SubmitResult =
  | { readonly success: true; readonly version: number }
  | { readonly success: false; readonly reason: string };

// Defaults

const DEFAULT_SNAPSHOT_IDLE_TIMEOUT = Duration.seconds(30);
const DEFAULT_MAX_TRANSACTION_HISTORY = 1000;
const DEFAULT_SNAPSHOT_INTERVAL = Duration.minutes(5);
const DEFAULT_SNAPSHOT_THRESHOLD = 100;

// Entity Handler

export const createEntityHandler = Effect.gen(function* () {
  const address = yield* Entity.CurrentAddress;
  const entityId = address.entityId;

  // Parse collectionId:documentId from entityId
  const separatorIndex = entityId.indexOf(":");
  if (separatorIndex === -1) {
    return yield* Effect.die(new Error(`Invalid entity ID format: ${entityId}`));
  }
  const collectionId = entityId.substring(0, separatorIndex);
  const documentId = entityId.substring(separatorIndex + 1);

  // Load collection schema from MySQL
  const collectionRepo = yield* CollectionRepositoryTag;
  const collection = yield* collectionRepo.findById(collectionId).pipe(
    Effect.mapError((cause) => new Error(`Failed to load collection ${collectionId}: ${cause}`)),
    Effect.orDie,
  );
  if (!collection) {
    return yield* Effect.die(new Error(`Collection not found: ${collectionId}`));
  }

  // Reconstruct runtime schema
  const schema = SchemaJSON.fromJSON(collection.schemaJson) as Primitive.AnyPrimitive;

  // Create storage
  const docRepo = yield* DocumentRepositoryTag;
  const coldStorage = makeMysqlColdStorage(docRepo);
  const hotStorage = makeMysqlHotStorage(docRepo);

  // Ensure document exists in metadata table
  const existingDoc = yield* docRepo.findById(documentId).pipe(
    Effect.mapError((cause) => new Error(`Failed to check document ${documentId}: ${cause}`)),
    Effect.orDie,
  );
  if (!existingDoc) {
    yield* docRepo.create(documentId, collectionId).pipe(
      Effect.mapError((cause) => new Error(`Failed to create document ${documentId}: ${cause}`)),
      Effect.orDie,
    );
  }

  // Schema version from collection
  const SCHEMA_VERSION = collection.schemaVersion;

  // Load snapshot from cold storage
  const storedDoc = yield* coldStorage.load(documentId).pipe(Effect.orDie);

  let initialState: unknown | undefined;
  let initialVersion = 0;

  if (storedDoc) {
    initialState = storedDoc.state;
    initialVersion = storedDoc.version;
  }

  // Create PubSub for broadcasting
  const broadcastPubSub = yield* PubSub.unbounded<Protocol.ServerBroadcast>();

  // Create refs for snapshot tracking
  const lastSnapshotVersionRef = yield* Ref.make(initialVersion);
  const lastSnapshotTimeRef = yield* Ref.make(Date.now());
  const transactionsSinceSnapshotRef = yield* Ref.make(0);

  // Create ServerDocument
  const document = ServerDocument.make({
    schema,
    initialState,
    initialVersion,
    maxTransactionHistory: DEFAULT_MAX_TRANSACTION_HISTORY,
    onBroadcast: (message) => {
      Effect.runSync(
        PubSub.publish(broadcastPubSub, {
          type: "transaction",
          transaction: message.transaction,
          version: message.version,
        }),
      );
    },
    onRejection: (transactionId, reason) => {
      Effect.runSync(
        PubSub.publish(broadcastPubSub, {
          type: "error",
          transactionId,
          reason,
        }),
      );
    },
  });

  // Save initial state to cold storage if new
  if (!storedDoc) {
    const initialStoredDoc: StoredDocument = {
      state: document.get(),
      version: 0,
      schemaVersion: SCHEMA_VERSION,
      savedAt: Date.now(),
    };
    yield* coldStorage.save(documentId, initialStoredDoc).pipe(Effect.orDie);
  }

  // Replay WAL
  const walEntries = yield* hotStorage.getEntries(documentId, initialVersion).pipe(Effect.orDie);
  for (const entry of walEntries) {
    const result = document.submit(entry.transaction);
    if (!result.success) {
      yield* Effect.logWarning("Skipping corrupted WAL entry", {
        documentId,
        version: entry.version,
      });
    }
  }

  // Presence state
  const presencePubSub = yield* PubSub.unbounded<PresenceEvent>();
  const presencesRef = yield* Ref.make(HashMap.empty<string, PresenceEntry>());

  // Snapshot save logic
  const saveSnapshot = Effect.gen(function* () {
    const targetVersion = document.getVersion();
    const lastSnapshotVersion = yield* Ref.get(lastSnapshotVersionRef);

    if (targetVersion <= lastSnapshotVersion) return;

    const baseSnapshot = yield* coldStorage.load(documentId).pipe(Effect.orDie);
    const baseVersion = baseSnapshot?.version ?? 0;
    const baseState = baseSnapshot?.state;

    const walEntries = yield* hotStorage.getEntries(documentId, baseVersion).pipe(Effect.orDie);
    const relevantEntries = walEntries.filter((e) => e.version <= targetVersion);

    if (relevantEntries.length === 0 && baseState === undefined) return;

    let snapshotState: unknown = baseState;
    for (const entry of relevantEntries) {
      const tempDoc = Document.make(schema, { initialState: snapshotState });
      tempDoc.apply(entry.transaction.ops);
      snapshotState = tempDoc.get();
    }

    if (snapshotState === undefined) return;

    const snapshotVersion =
      relevantEntries.length > 0 ? relevantEntries[relevantEntries.length - 1]!.version : 0;

    const currentLastSnapshot = yield* Ref.get(lastSnapshotVersionRef);
    if (snapshotVersion <= currentLastSnapshot) return;

    yield* coldStorage
      .save(documentId, {
        state: snapshotState,
        version: snapshotVersion,
        schemaVersion: SCHEMA_VERSION,
        savedAt: Date.now(),
      })
      .pipe(Effect.orDie);

    yield* Ref.set(lastSnapshotVersionRef, snapshotVersion);
    yield* Ref.set(lastSnapshotTimeRef, Date.now());
    yield* Ref.set(transactionsSinceSnapshotRef, 0);

    yield* hotStorage.truncate(documentId, snapshotVersion).pipe(
      Effect["catch"]((e) =>
        Effect.logWarning("WAL truncate failed", { documentId, error: e }),
      ),
    );
  });

  const checkSnapshotTriggers = Effect.gen(function* () {
    const txCount = yield* Ref.get(transactionsSinceSnapshotRef);
    const lastTime = yield* Ref.get(lastSnapshotTimeRef);
    const now = Date.now();

    if (
      txCount >= DEFAULT_SNAPSHOT_THRESHOLD ||
      now - lastTime >= Duration.toMillis(DEFAULT_SNAPSHOT_INTERVAL)
    ) {
      yield* saveSnapshot;
    }
  });

  // Cleanup on entity finalization
  yield* Effect.addFinalizer(() =>
    saveSnapshot.pipe(
      Effect["catch"]((e) =>
        Effect.logError("Failed to save snapshot during entity finalization", {
          documentId,
          error: e,
        }),
      ),
    ),
  );

  // Periodic snapshot fiber
  yield* saveSnapshot.pipe(
    Effect["catch"](() => Effect.void),
    Effect.repeat(Schedule.spaced(DEFAULT_SNAPSHOT_IDLE_TIMEOUT)),
    Effect.forkChild,
  );

  // RPC Handlers
  return {
    Submit: (msg: { payload: { transaction: { id: string; ops: readonly unknown[] } } }) => {
      const submitEffect: Effect.Effect<SubmitResult> = Effect.gen(function* () {
        const transaction = Transaction.decode(
          msg.payload.transaction as Transaction.EncodedTransaction,
        );

        const validation = document.validate(transaction);
        if (!validation.valid) {
          return { success: false as const, reason: validation.reason } satisfies SubmitResult;
        }

        const walEntry: WalEntry = {
          transaction,
          version: validation.nextVersion,
          timestamp: Date.now(),
        };

        const snapshotVersion = yield* Ref.get(lastSnapshotVersionRef);
        const appendResult = yield* Effect.result(
          hotStorage.appendWithCheck(documentId, walEntry, validation.nextVersion, snapshotVersion),
        );

        if (appendResult._tag === "Failure") {
          return { success: false as const, reason: "Storage unavailable. Please retry." } satisfies SubmitResult;
        }

        document.apply(transaction);
        yield* Ref.update(transactionsSinceSnapshotRef, (n) => n + 1);
        yield* checkSnapshotTriggers;

        return { success: true as const, version: validation.nextVersion } satisfies SubmitResult;
      }).pipe(Effect.orDie);
      return submitEffect;
    },

    GetSnapshot: () => Effect.succeed(document.getSnapshot()),

    GetTreeSnapshot: () => Effect.succeed(document.toSnapshot()),

    Touch: () => Effect.void,

    SetPresence: (msg: { payload: { connectionId: string; entry: PresenceEntry } }) =>
      Effect.gen(function* () {
        const { connectionId, entry } = msg.payload;
        yield* Ref.update(presencesRef, (map) => HashMap.set(map, connectionId, entry));
        yield* PubSub.publish(presencePubSub, {
          type: "presence_update",
          id: connectionId,
          data: entry.data,
          userId: entry.userId,
        });
      }),

    RemovePresence: (msg: { payload: { connectionId: string } }) =>
      Effect.gen(function* () {
        const { connectionId } = msg.payload;
        const presences = yield* Ref.get(presencesRef);
        if (!HashMap.has(presences, connectionId)) return;

        yield* Ref.update(presencesRef, (map) => HashMap.remove(map, connectionId));
        yield* PubSub.publish(presencePubSub, {
          type: "presence_remove",
          id: connectionId,
        });
      }),

    GetPresenceSnapshot: () =>
      Effect.gen(function* () {
        const presences = yield* Ref.get(presencesRef);
        const result: Record<string, PresenceEntry> = {};
        for (const [id, entry] of presences) {
          result[id] = entry;
        }
        return { presences: result };
      }),
  };
});

// Entity layer registration

export const MimicDocumentEntityLive = MimicDocumentEntity.toLayer(
  createEntityHandler,
  {
    maxIdleTime: Duration.minutes(5),
    concurrency: 1,
    mailboxCapacity: 4096,
  },
);
