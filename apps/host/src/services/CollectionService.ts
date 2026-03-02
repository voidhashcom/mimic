import { Effect, Layer, ServiceMap } from "effect";
import { SchemaJSON } from "@voidhash/mimic";
import type { Collection } from "../domain/Collection";
import { CollectionNotFoundError, CollectionAlreadyExistsError } from "../domain/Collection";
import { DatabaseNotFoundError } from "../domain/Database";
import { CollectionServiceError } from "../engine/Errors";
import { CollectionRepositoryTag } from "../mysql/CollectionRepository";
import { DatabaseRepositoryTag } from "../mysql/DatabaseRepository";

export interface CollectionService {
  readonly create: (
    databaseId: string,
    name: string,
    schemaJson: unknown,
  ) => Effect.Effect<Collection, DatabaseNotFoundError | CollectionAlreadyExistsError | CollectionServiceError>;
  readonly getById: (id: string) => Effect.Effect<Collection, CollectionNotFoundError | CollectionServiceError>;
  readonly listByDatabase: (databaseId: string) => Effect.Effect<readonly Collection[], CollectionServiceError>;
  readonly updateSchema: (
    id: string,
    schemaJson: unknown,
  ) => Effect.Effect<Collection, CollectionNotFoundError | CollectionServiceError>;
  readonly remove: (id: string) => Effect.Effect<void, CollectionNotFoundError | CollectionServiceError>;
}

export class CollectionServiceTag extends ServiceMap.Service<CollectionServiceTag, CollectionService>()(
  "@voidhash/mimic-host/CollectionService",
) {}

export const CollectionServiceLive = Layer.effect(
  CollectionServiceTag,
  Effect.gen(function* () {
    const collectionRepo = yield* CollectionRepositoryTag;
    const databaseRepo = yield* DatabaseRepositoryTag;

    const mapRepoError = <A>(effect: Effect.Effect<A, any>, message: string) =>
      effect.pipe(
        Effect.mapError((cause) => new CollectionServiceError({ message, cause })),
      );

    return {
      create: (databaseId, name, schemaJson) =>
        Effect.gen(function* () {
          const db = yield* mapRepoError(databaseRepo.findById(databaseId), "Failed to look up database");
          if (!db) {
            return yield* Effect.fail(new DatabaseNotFoundError({ databaseId }));
          }

          const existing = yield* mapRepoError(collectionRepo.findByDatabaseAndName(databaseId, name), "Failed to check existing collection");
          if (existing) {
            return yield* Effect.fail(new CollectionAlreadyExistsError({ databaseId, name }));
          }

          // Validate schema is reconstructible
          SchemaJSON.fromJSON(schemaJson);

          const id = crypto.randomUUID();
          yield* mapRepoError(collectionRepo.create(id, databaseId, name, schemaJson), "Failed to create collection");
          const collection = yield* mapRepoError(collectionRepo.findById(id), "Failed to fetch created collection");
          return collection!;
        }),

      getById: (id) =>
        Effect.gen(function* () {
          const collection = yield* mapRepoError(collectionRepo.findById(id), "Failed to look up collection");
          if (!collection) {
            return yield* Effect.fail(new CollectionNotFoundError({ collectionId: id }));
          }
          return collection;
        }),

      listByDatabase: (databaseId) => mapRepoError(collectionRepo.listByDatabase(databaseId), "Failed to list collections"),

      updateSchema: (id, schemaJson) =>
        Effect.gen(function* () {
          const collection = yield* mapRepoError(collectionRepo.findById(id), "Failed to look up collection");
          if (!collection) {
            return yield* Effect.fail(new CollectionNotFoundError({ collectionId: id }));
          }

          // Validate schema is reconstructible
          SchemaJSON.fromJSON(schemaJson);

          yield* mapRepoError(collectionRepo.publishSchema(id, schemaJson), "Failed to publish schema version");
          const updated = yield* mapRepoError(collectionRepo.findById(id), "Failed to fetch updated collection");
          return updated!;
        }),

      remove: (id) =>
        Effect.gen(function* () {
          const collection = yield* mapRepoError(collectionRepo.findById(id), "Failed to look up collection");
          if (!collection) {
            return yield* Effect.fail(new CollectionNotFoundError({ collectionId: id }));
          }
          yield* mapRepoError(collectionRepo.remove(id), "Failed to remove collection");
        }),
    };
  }),
);
