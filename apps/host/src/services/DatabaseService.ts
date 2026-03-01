import { Effect, Layer, ServiceMap } from "effect";
import type { Database, DatabaseCredential } from "../domain/Database";
import { DatabaseNotFoundError, DatabaseAlreadyExistsError } from "../domain/Database";
import { DatabaseRepositoryTag } from "../mysql/DatabaseRepository";

export interface DatabaseService {
  readonly create: (name: string, description?: string) => Effect.Effect<Database, DatabaseAlreadyExistsError>;
  readonly getById: (id: string) => Effect.Effect<Database, DatabaseNotFoundError>;
  readonly list: () => Effect.Effect<readonly Database[]>;
  readonly remove: (id: string) => Effect.Effect<void, DatabaseNotFoundError>;
  readonly createCredential: (
    databaseId: string,
    label: string,
    tokenHash: string,
    permission: "read" | "write",
  ) => Effect.Effect<DatabaseCredential, DatabaseNotFoundError>;
  readonly listCredentials: (databaseId: string) => Effect.Effect<readonly DatabaseCredential[]>;
  readonly removeCredential: (credentialId: string) => Effect.Effect<void>;
}

export class DatabaseServiceTag extends ServiceMap.Service<DatabaseServiceTag, DatabaseService>()(
  "@voidhash/mimic-host/DatabaseService",
) {}

export const DatabaseServiceLive = Layer.effect(
  DatabaseServiceTag,
  Effect.gen(function* () {
    const repo = yield* DatabaseRepositoryTag;

    // Wrap repo calls to die on SqlError (infrastructure failure)
    const orDieRepo = <A>(effect: Effect.Effect<A, any>) => effect.pipe(Effect.orDie) as Effect.Effect<A>;

    return {
      create: (name, description) =>
        Effect.gen(function* () {
          const existing = yield* orDieRepo(repo.findByName(name));
          if (existing) {
            return yield* Effect.fail(new DatabaseAlreadyExistsError({ name }));
          }
          const id = crypto.randomUUID();
          yield* orDieRepo(repo.create(id, name, description ?? null));
          const db = yield* orDieRepo(repo.findById(id));
          return db!;
        }),

      getById: (id) =>
        Effect.gen(function* () {
          const db = yield* orDieRepo(repo.findById(id));
          if (!db) {
            return yield* Effect.fail(new DatabaseNotFoundError({ databaseId: id }));
          }
          return db;
        }),

      list: () => orDieRepo(repo.list()),

      remove: (id) =>
        Effect.gen(function* () {
          const db = yield* orDieRepo(repo.findById(id));
          if (!db) {
            return yield* Effect.fail(new DatabaseNotFoundError({ databaseId: id }));
          }
          yield* orDieRepo(repo.remove(id));
        }),

      createCredential: (databaseId, label, tokenHash, permission) =>
        Effect.gen(function* () {
          const db = yield* orDieRepo(repo.findById(databaseId));
          if (!db) {
            return yield* Effect.fail(new DatabaseNotFoundError({ databaseId }));
          }
          const id = crypto.randomUUID();
          yield* orDieRepo(repo.createCredential(id, databaseId, label, tokenHash, permission));
          const cred = (yield* orDieRepo(repo.listCredentials(databaseId))).find((c) => c.id === id);
          return cred!;
        }),

      listCredentials: (databaseId) => orDieRepo(repo.listCredentials(databaseId)),

      removeCredential: (credentialId) => orDieRepo(repo.removeCredential(credentialId)),
    };
  }),
);
