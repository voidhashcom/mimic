import { Effect } from "effect";
import { Transaction } from "@voidhash/mimic";
import { DocumentRepositoryTag, type DocumentRepository } from "../mysql/DocumentRepository";
import { StorageError, WalVersionGapError } from "./Errors";

export interface StoredDocument {
  readonly state: unknown;
  readonly version: number;
  readonly schemaVersion: number;
  readonly savedAt: number;
}

export interface WalEntry {
  readonly transaction: Transaction.Transaction;
  readonly version: number;
  readonly timestamp: number;
}

export interface ColdStorage {
  readonly load: (documentId: string) => Effect.Effect<StoredDocument | undefined, StorageError>;
  readonly save: (documentId: string, doc: StoredDocument) => Effect.Effect<void, StorageError>;
  readonly delete: (documentId: string) => Effect.Effect<void, StorageError>;
}

export interface HotStorage {
  readonly append: (documentId: string, entry: WalEntry) => Effect.Effect<void, StorageError>;
  readonly appendWithCheck: (
    documentId: string,
    entry: WalEntry,
    expectedVersion: number,
    baseVersion?: number,
  ) => Effect.Effect<void, StorageError | WalVersionGapError>;
  readonly getEntries: (documentId: string, sinceVersion: number) => Effect.Effect<WalEntry[], StorageError>;
  readonly truncate: (documentId: string, upToVersion: number) => Effect.Effect<void, StorageError>;
}

export const makeMysqlColdStorage = (repo: DocumentRepository): ColdStorage => ({
  load: (documentId) =>
    repo.loadSnapshot(documentId).pipe(
      Effect.map((row) =>
        row
          ? {
              state: row.stateJson,
              version: row.version,
              schemaVersion: row.schemaVersion,
              savedAt: row.savedAt instanceof Date ? row.savedAt.getTime() : Number(row.savedAt),
            }
          : undefined,
      ),
      Effect.mapError((cause) => new StorageError({ operation: "load", cause })),
    ),

  save: (documentId, doc) =>
    repo.saveSnapshot(documentId, doc.state, doc.version, doc.schemaVersion).pipe(
      Effect.mapError((cause) => new StorageError({ operation: "save", cause })),
    ),

  delete: (documentId) =>
    repo.deleteSnapshot(documentId).pipe(
      Effect.mapError((cause) => new StorageError({ operation: "delete", cause })),
    ),
});

export const makeMysqlHotStorage = (repo: DocumentRepository): HotStorage => ({
  append: (documentId, entry) =>
    repo.appendWal(documentId, entry.version, Transaction.encode(entry.transaction), entry.timestamp).pipe(
      Effect.mapError((cause) => new StorageError({ operation: "append", cause })),
    ),

  appendWithCheck: (documentId, entry, expectedVersion, baseVersion) =>
    Effect.gen(function* () {
      // Check current max version in WAL
      const entries = yield* repo.getWalEntries(documentId, 0).pipe(
        Effect.mapError((cause) => new StorageError({ operation: "appendWithCheck", cause })),
      );

      const lastEntryVersion = entries.length > 0
        ? Math.max(...entries.map((e) => e.version))
        : 0;

      const effectiveLastVersion = baseVersion !== undefined
        ? Math.max(lastEntryVersion, baseVersion)
        : lastEntryVersion;

      if (expectedVersion === 1) {
        if (effectiveLastVersion >= 1) {
          return yield* Effect.fail(
            new WalVersionGapError({ documentId, expectedVersion, actualPreviousVersion: effectiveLastVersion }),
          );
        }
      } else {
        if (effectiveLastVersion !== expectedVersion - 1) {
          return yield* Effect.fail(
            new WalVersionGapError({
              documentId,
              expectedVersion,
              actualPreviousVersion: effectiveLastVersion > 0 ? effectiveLastVersion : undefined,
            }),
          );
        }
      }

      yield* repo.appendWal(documentId, entry.version, Transaction.encode(entry.transaction), entry.timestamp).pipe(
        Effect.mapError((cause) => new StorageError({ operation: "appendWithCheck", cause })),
      );
    }),

  getEntries: (documentId, sinceVersion) =>
    repo.getWalEntries(documentId, sinceVersion).pipe(
      Effect.map((rows) =>
        rows.map((row) => ({
          transaction: Transaction.decode(row.transactionJson as Transaction.EncodedTransaction),
          version: row.version,
          timestamp: Number(row.timestamp),
        })),
      ),
      Effect.mapError((cause) => new StorageError({ operation: "getEntries", cause })),
    ),

  truncate: (documentId, upToVersion) =>
    repo.truncateWal(documentId, upToVersion).pipe(
      Effect.mapError((cause) => new StorageError({ operation: "truncate", cause })),
    ),
});
