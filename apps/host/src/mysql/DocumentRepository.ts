import { Effect, Layer, ServiceMap } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { SqlError } from "effect/unstable/sql/SqlError";
import type { DocumentMeta } from "../domain/Document";

export interface StoredSnapshot {
  readonly documentId: string;
  readonly stateJson: unknown;
  readonly version: number;
  readonly schemaVersion: number;
  readonly savedAt: Date;
}

export interface StoredWalEntry {
  readonly id: number;
  readonly documentId: string;
  readonly version: number;
  readonly transactionJson: unknown;
  readonly timestamp: number;
}

export interface DocumentRepository {
  readonly create: (id: string, collectionId: string) => Effect.Effect<void, SqlError>;
  readonly findById: (id: string) => Effect.Effect<DocumentMeta | undefined, SqlError>;
  readonly listByCollection: (collectionId: string) => Effect.Effect<readonly DocumentMeta[], SqlError>;
  readonly softDelete: (id: string) => Effect.Effect<void, SqlError>;

  readonly loadSnapshot: (documentId: string) => Effect.Effect<StoredSnapshot | undefined, SqlError>;
  readonly saveSnapshot: (
    documentId: string,
    stateJson: unknown,
    version: number,
    schemaVersion: number,
  ) => Effect.Effect<void, SqlError>;
  readonly deleteSnapshot: (documentId: string) => Effect.Effect<void, SqlError>;

  readonly appendWal: (documentId: string, version: number, transactionJson: unknown, timestamp: number) => Effect.Effect<void, SqlError>;
  readonly getWalEntries: (documentId: string, sinceVersion: number) => Effect.Effect<readonly StoredWalEntry[], SqlError>;
  readonly truncateWal: (documentId: string, upToVersion: number) => Effect.Effect<void, SqlError>;
}

export class DocumentRepositoryTag extends ServiceMap.Service<DocumentRepositoryTag, DocumentRepository>()(
  "@voidhash/mimic-host/DocumentRepository",
) {}

export const DocumentRepositoryLive: Layer.Layer<DocumentRepositoryTag, never, SqlClient.SqlClient> = Layer.effect(
  DocumentRepositoryTag,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    return {
      create: (id, collectionId) =>
        sql`INSERT INTO mimic_documents (id, collection_id) VALUES (${id}, ${collectionId})`.pipe(
          Effect.asVoid,
        ),

      findById: (id) =>
        sql<DocumentMeta>`SELECT id, collection_id AS "collectionId", created_at AS "createdAt", deleted_at AS "deletedAt" FROM mimic_documents WHERE id = ${id}`.pipe(
          Effect.map((rows) => rows[0]),
        ),

      listByCollection: (collectionId) =>
        sql<DocumentMeta>`SELECT id, collection_id AS "collectionId", created_at AS "createdAt", deleted_at AS "deletedAt" FROM mimic_documents WHERE collection_id = ${collectionId} AND deleted_at IS NULL ORDER BY created_at DESC`,

      softDelete: (id) =>
        sql`UPDATE mimic_documents SET deleted_at = NOW() WHERE id = ${id}`.pipe(Effect.asVoid),

      loadSnapshot: (documentId) =>
        sql<StoredSnapshot>`SELECT document_id AS "documentId", state_json AS "stateJson", version, schema_version AS "schemaVersion", saved_at AS "savedAt" FROM mimic_document_snapshots WHERE document_id = ${documentId}`.pipe(
          Effect.map((rows) => rows[0]),
        ),

      saveSnapshot: (documentId, stateJson, version, schemaVersion) =>
        sql`INSERT INTO mimic_document_snapshots (document_id, state_json, version, schema_version) VALUES (${documentId}, ${JSON.stringify(stateJson)}, ${version}, ${schemaVersion}) ON DUPLICATE KEY UPDATE state_json = VALUES(state_json), version = VALUES(version), schema_version = VALUES(schema_version), saved_at = NOW()`.pipe(
          Effect.asVoid,
        ),

      deleteSnapshot: (documentId) =>
        sql`DELETE FROM mimic_document_snapshots WHERE document_id = ${documentId}`.pipe(Effect.asVoid),

      appendWal: (documentId, version, transactionJson, timestamp) =>
        sql`INSERT INTO mimic_document_wal (document_id, version, transaction_json, timestamp) VALUES (${documentId}, ${version}, ${JSON.stringify(transactionJson)}, ${timestamp})`.pipe(
          Effect.asVoid,
        ),

      getWalEntries: (documentId, sinceVersion) =>
        sql<StoredWalEntry>`SELECT id, document_id AS "documentId", version, transaction_json AS "transactionJson", timestamp FROM mimic_document_wal WHERE document_id = ${documentId} AND version > ${sinceVersion} ORDER BY version ASC`,

      truncateWal: (documentId, upToVersion) =>
        sql`DELETE FROM mimic_document_wal WHERE document_id = ${documentId} AND version <= ${upToVersion}`.pipe(
          Effect.asVoid,
        ),
    };
  }),
);
