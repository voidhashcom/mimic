import { Effect, Layer, ServiceMap } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { SqlError } from "effect/unstable/sql/SqlError";
import type { Collection } from "../domain/Collection";

export interface CollectionRepository {
  readonly create: (id: string, databaseId: string, name: string, schemaJson: unknown) => Effect.Effect<void, SqlError>;
  readonly findById: (id: string) => Effect.Effect<Collection | undefined, SqlError>;
  readonly findByDatabaseAndName: (databaseId: string, name: string) => Effect.Effect<Collection | undefined, SqlError>;
  readonly listByDatabase: (databaseId: string) => Effect.Effect<readonly Collection[], SqlError>;
  readonly publishSchema: (id: string, schemaJson: unknown) => Effect.Effect<number, SqlError>;
  readonly findSchemaVersion: (collectionId: string, version: number) => Effect.Effect<unknown | undefined, SqlError>;
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
        Effect.gen(function* () {
          yield* sql`INSERT INTO mimic_collections (id, database_id, name, schema_json) VALUES (${id}, ${databaseId}, ${name}, ${JSON.stringify(schemaJson)})`.pipe(
            Effect.asVoid,
          );
          // Insert initial schema version history row
          yield* sql`INSERT INTO mimic_collection_schema_versions (collection_id, version, schema_json) VALUES (${id}, 1, ${JSON.stringify(schemaJson)})`.pipe(
            Effect.asVoid,
          );
        }),

      findById: (id) =>
        sql<Collection>`SELECT id, database_id AS "databaseId", name, schema_json AS "schemaJson", schema_version AS "schemaVersion", created_at AS "createdAt", updated_at AS "updatedAt" FROM mimic_collections WHERE id = ${id}`.pipe(
          Effect.map((rows) => rows[0]),
        ),

      findByDatabaseAndName: (databaseId, name) =>
        sql<Collection>`SELECT id, database_id AS "databaseId", name, schema_json AS "schemaJson", schema_version AS "schemaVersion", created_at AS "createdAt", updated_at AS "updatedAt" FROM mimic_collections WHERE database_id = ${databaseId} AND name = ${name}`.pipe(
          Effect.map((rows) => rows[0]),
        ),

      listByDatabase: (databaseId) =>
        sql<Collection>`SELECT id, database_id AS "databaseId", name, schema_json AS "schemaJson", schema_version AS "schemaVersion", created_at AS "createdAt", updated_at AS "updatedAt" FROM mimic_collections WHERE database_id = ${databaseId} ORDER BY created_at DESC`,

      publishSchema: (id, schemaJson) =>
        Effect.gen(function* () {
          const rows = yield* sql<{ schemaVersion: number }>`SELECT schema_version AS "schemaVersion" FROM mimic_collections WHERE id = ${id}`;
          const newVersion = (rows[0]?.schemaVersion ?? 0) + 1;

          yield* sql`INSERT INTO mimic_collection_schema_versions (collection_id, version, schema_json) VALUES (${id}, ${newVersion}, ${JSON.stringify(schemaJson)})`.pipe(
            Effect.asVoid,
          );

          yield* sql`UPDATE mimic_collections SET schema_json = ${JSON.stringify(schemaJson)}, schema_version = ${newVersion} WHERE id = ${id}`.pipe(
            Effect.asVoid,
          );

          return newVersion;
        }),

      findSchemaVersion: (collectionId, version) =>
        sql<{ schemaJson: unknown }>`SELECT schema_json AS "schemaJson" FROM mimic_collection_schema_versions WHERE collection_id = ${collectionId} AND version = ${version}`.pipe(
          Effect.map((rows) => rows[0]?.schemaJson),
        ),

      remove: (id) =>
        sql`DELETE FROM mimic_collections WHERE id = ${id}`.pipe(Effect.asVoid),
    };
  }),
);
