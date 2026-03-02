import { Config, Effect, Layer } from "effect";
import { UserServiceTag } from "./UserService";
import { UserRepositoryTag } from "../mysql/UserRepository";

export const BootstrapLive = Layer.effectDiscard(
  Effect.gen(function* () {
    const userService = yield* UserServiceTag;
    const userRepo = yield* UserRepositoryTag;

    const rootUsername = yield* Config.string("ROOT_USERNAME");
    const rootPassword = yield* Config.string("ROOT_PASSWORD");

    const existing = yield* userService.getByUsername(rootUsername).pipe(
      Effect.catchTag("UserNotFoundError", () => Effect.succeed(undefined)),
    );

    if (!existing) {
      const id = crypto.randomUUID();
      const passwordHash = yield* Effect.tryPromise({
        try: () => Bun.password.hash(rootPassword),
        catch: (cause) => new Error(`Failed to hash root password: ${cause}`),
      });
      yield* userRepo.create(id, rootUsername, passwordHash, true).pipe(
        Effect.mapError((cause) => new Error(`Failed to create root user: ${cause}`)),
      );
      yield* Effect.log(`Root user '${rootUsername}' created`);
    } else {
      const passwordMatch = yield* userService.verifyPassword(existing, rootPassword);
      if (!passwordMatch) {
        yield* userService.updatePassword(existing.id, rootPassword);
        yield* Effect.log(`Root user '${rootUsername}' password updated`);
      } else {
        yield* Effect.log(`Root user '${rootUsername}' already exists`);
      }
    }
  }),
);
