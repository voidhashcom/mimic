import { Effect, Layer, ServiceMap } from "effect";
import type { Database, DatabaseCredential } from "../domain/Database";
import { DatabaseNotFoundError, DatabaseAlreadyExistsError } from "../domain/Database";
import { DatabaseServiceError } from "../engine/Errors";
import { DatabaseRepositoryTag } from "../mysql/DatabaseRepository";

export interface DatabaseService {
  readonly create: (name: string, description?: string) => Effect.Effect<Database, DatabaseAlreadyExistsError | DatabaseServiceError>;
  readonly getById: (id: string) => Effect.Effect<Database, DatabaseNotFoundError | DatabaseServiceError>;
  readonly list: () => Effect.Effect<readonly Database[], DatabaseServiceError>;
  readonly remove: (id: string) => Effect.Effect<void, DatabaseNotFoundError | DatabaseServiceError>;
  readonly createCredential: (
    databaseId: string,
    label: string,
    tokenHash: string,
    permission: "read" | "write" | "admin",
  ) => Effect.Effect<DatabaseCredential, DatabaseNotFoundError | DatabaseServiceError>;
  readonly listCredentials: (databaseId: string) => Effect.Effect<readonly DatabaseCredential[], DatabaseServiceError>;
  readonly removeCredential: (credentialId: string) => Effect.Effect<void, DatabaseServiceError>;
}

export class DatabaseServiceTag extends ServiceMap.Service<DatabaseServiceTag, DatabaseService>()(
  "@voidhash/mimic-host/DatabaseService",
) {}

export const DatabaseServiceLive = Layer.effect(
  DatabaseServiceTag,
  Effect.gen(function* () {
    const repo = yield* DatabaseRepositoryTag;

    const mapRepoError = <A>(effect: Effect.Effect<A, any>, message: string) =>
      effect.pipe(
        Effect.mapError((cause) => new DatabaseServiceError({ message, cause })),
      );

    return {
      create: (name, description) =>
        Effect.gen(function* () {
          const existing = yield* mapRepoError(repo.findByName(name), "Failed to check existing database");
          if (existing) {
            return yield* Effect.fail(new DatabaseAlreadyExistsError({ name }));
          }
          const id = crypto.randomUUID();
          yield* mapRepoError(repo.create(id, name, description ?? null), "Failed to create database");
          const db = yield* mapRepoError(repo.findById(id), "Failed to fetch created database");
          return db!;
        }),

      getById: (id) =>
        Effect.gen(function* () {
          const db = yield* mapRepoError(repo.findById(id), "Failed to look up database");
          if (!db) {
            return yield* Effect.fail(new DatabaseNotFoundError({ databaseId: id }));
          }
          return db;
        }),

      list: () => mapRepoError(repo.list(), "Failed to list databases"),

      remove: (id) =>
        Effect.gen(function* () {
          const db = yield* mapRepoError(repo.findById(id), "Failed to look up database");
          if (!db) {
            return yield* Effect.fail(new DatabaseNotFoundError({ databaseId: id }));
          }
          yield* mapRepoError(repo.remove(id), "Failed to remove database");
        }),

      createCredential: (databaseId, label, tokenHash, permission) =>
        Effect.gen(function* () {
          const db = yield* mapRepoError(repo.findById(databaseId), "Failed to look up database");
          if (!db) {
            return yield* Effect.fail(new DatabaseNotFoundError({ databaseId }));
          }
          const id = crypto.randomUUID();
          yield* mapRepoError(repo.createCredential(id, databaseId, label, tokenHash, permission), "Failed to create credential");
          const cred = (yield* mapRepoError(repo.listCredentials(databaseId), "Failed to list credentials")).find((c) => c.id === id);
          return cred!;
        }),

      listCredentials: (databaseId) => mapRepoError(repo.listCredentials(databaseId), "Failed to list credentials"),

      removeCredential: (credentialId) => mapRepoError(repo.removeCredential(credentialId), "Failed to remove credential"),
    };
  }),
);
