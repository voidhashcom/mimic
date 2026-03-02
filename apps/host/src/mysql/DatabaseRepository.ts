import { Effect, Layer, ServiceMap } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { SqlError } from "effect/unstable/sql/SqlError";
import type { Database } from "../domain/Database";

export interface DatabaseRepository {
  readonly create: (id: string, name: string, description: string | null) => Effect.Effect<void, SqlError>;
  readonly findById: (id: string) => Effect.Effect<Database | undefined, SqlError>;
  readonly findByName: (name: string) => Effect.Effect<Database | undefined, SqlError>;
  readonly list: () => Effect.Effect<readonly Database[], SqlError>;
  readonly remove: (id: string) => Effect.Effect<void, SqlError>;
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
    };
  }),
);
