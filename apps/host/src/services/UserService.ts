import { Effect, Layer, ServiceMap } from "effect";
import type { User, UserGrant } from "../domain/User";
import { UserNotFoundError, UserAlreadyExistsError, GrantNotFoundError } from "../domain/User";
import { UserServiceError } from "../engine/Errors";
import { UserRepositoryTag } from "../mysql/UserRepository";

export interface UserService {
  readonly createUser: (
    username: string,
    password: string,
  ) => Effect.Effect<User, UserAlreadyExistsError | UserServiceError>;
  readonly getById: (id: string) => Effect.Effect<User, UserNotFoundError | UserServiceError>;
  readonly getByUsername: (username: string) => Effect.Effect<User, UserNotFoundError | UserServiceError>;
  readonly listUsers: () => Effect.Effect<readonly User[], UserServiceError>;
  readonly deleteUser: (id: string) => Effect.Effect<void, UserNotFoundError | UserServiceError>;
  readonly verifyPassword: (user: User, password: string) => Effect.Effect<boolean, UserServiceError>;
  readonly updatePassword: (id: string, password: string) => Effect.Effect<void, UserNotFoundError | UserServiceError>;
  readonly grantPermission: (
    userId: string,
    databaseId: string,
    permission: "read" | "write" | "admin",
  ) => Effect.Effect<void, UserNotFoundError | UserServiceError>;
  readonly revokePermission: (
    userId: string,
    databaseId: string,
  ) => Effect.Effect<void, GrantNotFoundError | UserServiceError>;
  readonly listGrants: (userId?: string) => Effect.Effect<readonly UserGrant[], UserServiceError>;
  readonly getUserPermissionForDatabase: (
    userId: string,
    databaseId: string,
  ) => Effect.Effect<UserGrant | undefined, UserServiceError>;
}

export class UserServiceTag extends ServiceMap.Service<UserServiceTag, UserService>()(
  "@voidhash/mimic-host/UserService",
) {}

export const UserServiceLive = Layer.effect(
  UserServiceTag,
  Effect.gen(function* () {
    const repo = yield* UserRepositoryTag;

    const mapRepoError = <A>(effect: Effect.Effect<A, any>, message: string) =>
      effect.pipe(
        Effect.mapError((cause) => new UserServiceError({ message, cause })),
      );

    return {
      createUser: (username, password) =>
        Effect.gen(function* () {
          const existing = yield* mapRepoError(repo.findByUsername(username), "Failed to check existing user");
          if (existing) {
            return yield* Effect.fail(new UserAlreadyExistsError({ username }));
          }
          const id = crypto.randomUUID();
          const passwordHash = yield* Effect.tryPromise({
            try: () => Bun.password.hash(password),
            catch: (cause) => new UserServiceError({ message: "Failed to hash password", cause }),
          });
          yield* mapRepoError(repo.create(id, username, passwordHash, false), "Failed to create user");
          const user = yield* mapRepoError(repo.findById(id), "Failed to fetch created user");
          return user!;
        }),

      getById: (id) =>
        Effect.gen(function* () {
          const user = yield* mapRepoError(repo.findById(id), "Failed to look up user");
          if (!user) {
            return yield* Effect.fail(new UserNotFoundError({ userId: id }));
          }
          return user;
        }),

      getByUsername: (username) =>
        Effect.gen(function* () {
          const user = yield* mapRepoError(repo.findByUsername(username), "Failed to look up user");
          if (!user) {
            return yield* Effect.fail(new UserNotFoundError({ userId: username }));
          }
          return user;
        }),

      listUsers: () => mapRepoError(repo.list(), "Failed to list users"),

      deleteUser: (id) =>
        Effect.gen(function* () {
          const user = yield* mapRepoError(repo.findById(id), "Failed to look up user");
          if (!user) {
            return yield* Effect.fail(new UserNotFoundError({ userId: id }));
          }
          yield* mapRepoError(repo.remove(id), "Failed to delete user");
        }),

      verifyPassword: (user, password) =>
        Effect.tryPromise({
          try: () => Bun.password.verify(password, user.passwordHash),
          catch: (cause) => new UserServiceError({ message: "Failed to verify password", cause }),
        }),

      updatePassword: (id, password) =>
        Effect.gen(function* () {
          const user = yield* mapRepoError(repo.findById(id), "Failed to look up user");
          if (!user) {
            return yield* Effect.fail(new UserNotFoundError({ userId: id }));
          }
          const passwordHash = yield* Effect.tryPromise({
            try: () => Bun.password.hash(password),
            catch: (cause) => new UserServiceError({ message: "Failed to hash password", cause }),
          });
          yield* mapRepoError(repo.updatePasswordHash(id, passwordHash), "Failed to update password");
        }),

      grantPermission: (userId, databaseId, permission) =>
        Effect.gen(function* () {
          const user = yield* mapRepoError(repo.findById(userId), "Failed to look up user");
          if (!user) {
            return yield* Effect.fail(new UserNotFoundError({ userId }));
          }
          const id = crypto.randomUUID();
          yield* mapRepoError(repo.createGrant(id, userId, databaseId, permission), "Failed to create grant");
        }),

      revokePermission: (userId, databaseId) =>
        Effect.gen(function* () {
          const grant = yield* mapRepoError(repo.findGrant(userId, databaseId), "Failed to look up grant");
          if (!grant) {
            return yield* Effect.fail(new GrantNotFoundError({ userId, databaseId }));
          }
          yield* mapRepoError(repo.removeGrant(userId, databaseId), "Failed to remove grant");
        }),

      listGrants: (userId) =>
        userId
          ? mapRepoError(repo.listGrantsByUser(userId), "Failed to list grants")
          : mapRepoError(repo.listGrants(), "Failed to list grants"),

      getUserPermissionForDatabase: (userId, databaseId) =>
        mapRepoError(repo.findGrant(userId, databaseId), "Failed to look up grant"),
    };
  }),
);
