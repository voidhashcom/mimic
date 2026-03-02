import { Effect, Layer, ServiceMap } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { SqlError } from "effect/unstable/sql/SqlError";
import type { DocumentToken } from "../domain/DocumentToken";

export interface DocumentTokenRepository {
  readonly create: (
    id: string,
    tokenHash: string,
    collectionId: string,
    documentId: string,
    permission: "read" | "write",
    expiresAt: Date,
  ) => Effect.Effect<void, SqlError>;
  readonly findByTokenHash: (tokenHash: string) => Effect.Effect<DocumentToken | undefined, SqlError>;
  readonly markUsed: (id: string) => Effect.Effect<void, SqlError>;
  readonly deleteExpired: () => Effect.Effect<void, SqlError>;
  readonly listByDocument: (
    collectionId: string,
    documentId: string,
  ) => Effect.Effect<readonly DocumentToken[], SqlError>;
}

export class DocumentTokenRepositoryTag extends ServiceMap.Service<
  DocumentTokenRepositoryTag,
  DocumentTokenRepository
>()("@voidhash/mimic-host/DocumentTokenRepository") {}

export const DocumentTokenRepositoryLive: Layer.Layer<
  DocumentTokenRepositoryTag,
  never,
  SqlClient.SqlClient
> = Layer.effect(
  DocumentTokenRepositoryTag,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    return {
      create: (id, tokenHash, collectionId, documentId, permission, expiresAt) =>
        sql`INSERT INTO document_tokens (id, token_hash, collection_id, document_id, permission, expires_at) VALUES (${id}, ${tokenHash}, ${collectionId}, ${documentId}, ${permission}, ${expiresAt})`.pipe(
          Effect.asVoid,
        ),

      findByTokenHash: (tokenHash) =>
        sql<DocumentToken>`SELECT id, token_hash AS "tokenHash", collection_id AS "collectionId", document_id AS "documentId", permission, expires_at AS "expiresAt", used_at AS "usedAt", created_at AS "createdAt" FROM document_tokens WHERE token_hash = ${tokenHash}`.pipe(
          Effect.map((rows) => rows[0]),
        ),

      markUsed: (id) =>
        sql`UPDATE document_tokens SET used_at = NOW() WHERE id = ${id}`.pipe(Effect.asVoid),

      deleteExpired: () =>
        sql`DELETE FROM document_tokens WHERE expires_at < NOW()`.pipe(Effect.asVoid),

      listByDocument: (collectionId, documentId) =>
        sql<DocumentToken>`SELECT id, token_hash AS "tokenHash", collection_id AS "collectionId", document_id AS "documentId", permission, expires_at AS "expiresAt", used_at AS "usedAt", created_at AS "createdAt" FROM document_tokens WHERE collection_id = ${collectionId} AND document_id = ${documentId}`,
    };
  }),
);
