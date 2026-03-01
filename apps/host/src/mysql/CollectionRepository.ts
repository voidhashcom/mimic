import { Effect, Layer, ServiceMap } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { SqlError } from "effect/unstable/sql/SqlError";
import type { Collection } from "../domain/Collection";

export interface CollectionRepository {
  readonly create: (id: string, databaseId: string, name: string, schemaJson: unknown) => Effect.Effect<void, SqlError>;
  readonly findById: (id: string) => Effect.Effect<Collection | undefined, SqlError>;
  readonly findByDatabaseAndName: (databaseId: string, name: string) => Effect.Effect<Collection | undefined, SqlError>;
  readonly listByDatabase: (databaseId: string) => Effect.Effect<readonly Collection[], SqlError>;
  readonly updateSchema: (id: string, schemaJson: unknown) => Effect.Effect<void, SqlError>;
  readonly remove: (id: string) => Effect.Effect<void, SqlError>;
}

export class CollectionRepositoryTag extends ServiceMap.Service<CollectionRepositoryTag, CollectionRepository>()(
  "@voidhash/mimic-host/CollectionRepository",
) {}

export const CollectionRepositoryLive: Layer.Layer<CollectionRepositoryTag, never, SqlClient.SqlClient> = Layer.effect(
  CollectionRepositoryTag,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    return {
      create: (id, databaseId, name, schemaJson) =>
        sql`INSERT INTO collections (id, database_id, name, schema_json) VALUES (${id}, ${databaseId}, ${name}, ${JSON.stringify(schemaJson)})`.pipe(
          Effect.asVoid,
        ),

      findById: (id) =>
        sql<Collection>`SELECT id, database_id AS "databaseId", name, schema_json AS "schemaJson", created_at AS "createdAt", updated_at AS "updatedAt" FROM collections WHERE id = ${id}`.pipe(
          Effect.map((rows) => rows[0]),
        ),

      findByDatabaseAndName: (databaseId, name) =>
        sql<Collection>`SELECT id, database_id AS "databaseId", name, schema_json AS "schemaJson", created_at AS "createdAt", updated_at AS "updatedAt" FROM collections WHERE database_id = ${databaseId} AND name = ${name}`.pipe(
          Effect.map((rows) => rows[0]),
        ),

      listByDatabase: (databaseId) =>
        sql<Collection>`SELECT id, database_id AS "databaseId", name, schema_json AS "schemaJson", created_at AS "createdAt", updated_at AS "updatedAt" FROM collections WHERE database_id = ${databaseId} ORDER BY created_at DESC`,

      updateSchema: (id, schemaJson) =>
        sql`UPDATE collections SET schema_json = ${JSON.stringify(schemaJson)} WHERE id = ${id}`.pipe(
          Effect.asVoid,
        ),

      remove: (id) =>
        sql`DELETE FROM collections WHERE id = ${id}`.pipe(Effect.asVoid),
    };
  }),
);
