import { Effect, Layer, ServiceMap } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { SqlError } from "effect/unstable/sql/SqlError";
import type { Database, DatabaseCredential } from "../domain/Database";

export interface DatabaseRepository {
  readonly create: (id: string, name: string, description: string | null) => Effect.Effect<void, SqlError>;
  readonly findById: (id: string) => Effect.Effect<Database | undefined, SqlError>;
  readonly findByName: (name: string) => Effect.Effect<Database | undefined, SqlError>;
  readonly list: () => Effect.Effect<readonly Database[], SqlError>;
  readonly remove: (id: string) => Effect.Effect<void, SqlError>;
  readonly createCredential: (
    id: string,
    databaseId: string,
    label: string,
    tokenHash: string,
    permission: "read" | "write" | "admin",
  ) => Effect.Effect<void, SqlError>;
  readonly findCredentialByTokenHash: (tokenHash: string) => Effect.Effect<DatabaseCredential | undefined, SqlError>;
  readonly listCredentials: (databaseId: string) => Effect.Effect<readonly DatabaseCredential[], SqlError>;
  readonly removeCredential: (id: string) => Effect.Effect<void, SqlError>;
}

export class DatabaseRepositoryTag extends ServiceMap.Service<DatabaseRepositoryTag, DatabaseRepository>()(
  "@voidhash/mimic-host/DatabaseRepository",
) {}

export const DatabaseRepositoryLive: Layer.Layer<DatabaseRepositoryTag, never, SqlClient.SqlClient> = Layer.effect(
  DatabaseRepositoryTag,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    return {
      create: (id, name, description) =>
        sql`INSERT INTO databases (id, name, description) VALUES (${id}, ${name}, ${description})`.pipe(
          Effect.asVoid,
        ),

      findById: (id) =>
        sql<Database>`SELECT id, name, description, created_at AS "createdAt", updated_at AS "updatedAt" FROM databases WHERE id = ${id}`.pipe(
          Effect.map((rows) => rows[0]),
        ),

      findByName: (name) =>
        sql<Database>`SELECT id, name, description, created_at AS "createdAt", updated_at AS "updatedAt" FROM databases WHERE name = ${name}`.pipe(
          Effect.map((rows) => rows[0]),
        ),

      list: () =>
        sql<Database>`SELECT id, name, description, created_at AS "createdAt", updated_at AS "updatedAt" FROM databases ORDER BY created_at DESC`,

      remove: (id) =>
        sql`DELETE FROM databases WHERE id = ${id}`.pipe(Effect.asVoid),

      createCredential: (id, databaseId, label, tokenHash, permission) =>
        sql`INSERT INTO database_credentials (id, database_id, label, token_hash, permission) VALUES (${id}, ${databaseId}, ${label}, ${tokenHash}, ${permission})`.pipe(
          Effect.asVoid,
        ),

      findCredentialByTokenHash: (tokenHash) =>
        sql<DatabaseCredential>`SELECT id, database_id AS "databaseId", label, token_hash AS "tokenHash", permission, created_at AS "createdAt" FROM database_credentials WHERE token_hash = ${tokenHash}`.pipe(
          Effect.map((rows) => rows[0]),
        ),

      listCredentials: (databaseId) =>
        sql<DatabaseCredential>`SELECT id, database_id AS "databaseId", label, token_hash AS "tokenHash", permission, created_at AS "createdAt" FROM database_credentials WHERE database_id = ${databaseId}`,

      removeCredential: (id) =>
        sql`DELETE FROM database_credentials WHERE id = ${id}`.pipe(Effect.asVoid),
    };
  }),
);
