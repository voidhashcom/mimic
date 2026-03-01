import { Effect, Layer, ServiceMap } from "effect";
import { SchemaJSON } from "@voidhash/mimic";
import type { Collection } from "../domain/Collection";
import { CollectionNotFoundError, CollectionAlreadyExistsError } from "../domain/Collection";
import { DatabaseNotFoundError } from "../domain/Database";
import { CollectionRepositoryTag } from "../mysql/CollectionRepository";
import { DatabaseRepositoryTag } from "../mysql/DatabaseRepository";

export interface CollectionService {
  readonly create: (
    databaseId: string,
    name: string,
    schemaJson: unknown,
  ) => Effect.Effect<Collection, DatabaseNotFoundError | CollectionAlreadyExistsError>;
  readonly getById: (id: string) => Effect.Effect<Collection, CollectionNotFoundError>;
  readonly listByDatabase: (databaseId: string) => Effect.Effect<readonly Collection[]>;
  readonly remove: (id: string) => Effect.Effect<void, CollectionNotFoundError>;
}

export class CollectionServiceTag extends ServiceMap.Service<CollectionServiceTag, CollectionService>()(
  "@voidhash/mimic-host/CollectionService",
) {}

export const CollectionServiceLive = Layer.effect(
  CollectionServiceTag,
  Effect.gen(function* () {
    const collectionRepo = yield* CollectionRepositoryTag;
    const databaseRepo = yield* DatabaseRepositoryTag;

    const orDieRepo = <A>(effect: Effect.Effect<A, any>) => effect.pipe(Effect.orDie) as Effect.Effect<A>;

    return {
      create: (databaseId, name, schemaJson) =>
        Effect.gen(function* () {
          const db = yield* orDieRepo(databaseRepo.findById(databaseId));
          if (!db) {
            return yield* Effect.fail(new DatabaseNotFoundError({ databaseId }));
          }

          const existing = yield* orDieRepo(collectionRepo.findByDatabaseAndName(databaseId, name));
          if (existing) {
            return yield* Effect.fail(new CollectionAlreadyExistsError({ databaseId, name }));
          }

          // Validate schema is reconstructible
          SchemaJSON.fromJSON(schemaJson);

          const id = crypto.randomUUID();
          yield* orDieRepo(collectionRepo.create(id, databaseId, name, schemaJson));
          const collection = yield* orDieRepo(collectionRepo.findById(id));
          return collection!;
        }),

      getById: (id) =>
        Effect.gen(function* () {
          const collection = yield* orDieRepo(collectionRepo.findById(id));
          if (!collection) {
            return yield* Effect.fail(new CollectionNotFoundError({ collectionId: id }));
          }
          return collection;
        }),

      listByDatabase: (databaseId) => orDieRepo(collectionRepo.listByDatabase(databaseId)),

      remove: (id) =>
        Effect.gen(function* () {
          const collection = yield* orDieRepo(collectionRepo.findById(id));
          if (!collection) {
            return yield* Effect.fail(new CollectionNotFoundError({ collectionId: id }));
          }
          yield* orDieRepo(collectionRepo.remove(id));
        }),
    };
  }),
);
