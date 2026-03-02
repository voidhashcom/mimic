import { Effect, Layer, ServiceMap } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { SqlError } from "effect/unstable/sql/SqlError";
import type { User, UserGrant } from "../domain/User";

export interface UserRepository {
  readonly create: (
    id: string,
    username: string,
    passwordHash: string,
    isSuperuser: boolean,
  ) => Effect.Effect<void, SqlError>;
  readonly findById: (id: string) => Effect.Effect<User | undefined, SqlError>;
  readonly findByUsername: (username: string) => Effect.Effect<User | undefined, SqlError>;
  readonly list: () => Effect.Effect<readonly User[], SqlError>;
  readonly remove: (id: string) => Effect.Effect<void, SqlError>;
  readonly updatePasswordHash: (id: string, passwordHash: string) => Effect.Effect<void, SqlError>;
  readonly createGrant: (
    id: string,
    userId: string,
    databaseId: string,
    permission: "read" | "write" | "admin",
  ) => Effect.Effect<void, SqlError>;
  readonly findGrant: (userId: string, databaseId: string) => Effect.Effect<UserGrant | undefined, SqlError>;
  readonly listGrantsByUser: (userId: string) => Effect.Effect<readonly UserGrant[], SqlError>;
  readonly listGrants: () => Effect.Effect<readonly UserGrant[], SqlError>;
  readonly removeGrant: (userId: string, databaseId: string) => Effect.Effect<void, SqlError>;
}

export class UserRepositoryTag extends ServiceMap.Service<UserRepositoryTag, UserRepository>()(
  "@voidhash/mimic-host/UserRepository",
) {}

export const UserRepositoryLive: Layer.Layer<UserRepositoryTag, never, SqlClient.SqlClient> = Layer.effect(
  UserRepositoryTag,
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    return {
      create: (id, username, passwordHash, isSuperuser) =>
        sql`INSERT INTO mimic_users (id, username, password_hash, is_superuser) VALUES (${id}, ${username}, ${passwordHash}, ${isSuperuser})`.pipe(
          Effect.asVoid,
        ),

      findById: (id) =>
        sql<User>`SELECT id, username, password_hash AS "passwordHash", is_superuser AS "isSuperuser", created_at AS "createdAt", updated_at AS "updatedAt" FROM mimic_users WHERE id = ${id}`.pipe(
          Effect.map((rows) => rows[0]),
        ),

      findByUsername: (username) =>
        sql<User>`SELECT id, username, password_hash AS "passwordHash", is_superuser AS "isSuperuser", created_at AS "createdAt", updated_at AS "updatedAt" FROM mimic_users WHERE username = ${username}`.pipe(
          Effect.map((rows) => rows[0]),
        ),

      list: () =>
        sql<User>`SELECT id, username, password_hash AS "passwordHash", is_superuser AS "isSuperuser", created_at AS "createdAt", updated_at AS "updatedAt" FROM mimic_users ORDER BY created_at DESC`,

      remove: (id) => sql`DELETE FROM mimic_users WHERE id = ${id}`.pipe(Effect.asVoid),

      updatePasswordHash: (id, passwordHash) =>
        sql`UPDATE mimic_users SET password_hash = ${passwordHash} WHERE id = ${id}`.pipe(Effect.asVoid),

      createGrant: (id, userId, databaseId, permission) =>
        sql`INSERT INTO mimic_user_grants (id, user_id, database_id, permission) VALUES (${id}, ${userId}, ${databaseId}, ${permission}) ON DUPLICATE KEY UPDATE permission = ${permission}`.pipe(
          Effect.asVoid,
        ),

      findGrant: (userId, databaseId) =>
        sql<UserGrant>`SELECT id, user_id AS "userId", database_id AS "databaseId", permission, created_at AS "createdAt" FROM mimic_user_grants WHERE user_id = ${userId} AND database_id = ${databaseId}`.pipe(
          Effect.map((rows) => rows[0]),
        ),

      listGrantsByUser: (userId) =>
        sql<UserGrant>`SELECT id, user_id AS "userId", database_id AS "databaseId", permission, created_at AS "createdAt" FROM mimic_user_grants WHERE user_id = ${userId}`,

      listGrants: () =>
        sql<UserGrant>`SELECT id, user_id AS "userId", database_id AS "databaseId", permission, created_at AS "createdAt" FROM mimic_user_grants`,

      removeGrant: (userId, databaseId) =>
        sql`DELETE FROM mimic_user_grants WHERE user_id = ${userId} AND database_id = ${databaseId}`.pipe(Effect.asVoid),
    };
  }),
);
