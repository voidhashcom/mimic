import { Effect, Layer, ServiceMap } from "effect";
import { DatabaseRepositoryTag } from "../mysql/DatabaseRepository";
import { AuthenticationError } from "../engine/Errors";
import type { Permission } from "../engine/Protocol";

export interface AuthContext {
  readonly userId: string;
  readonly permission: Permission;
  readonly databaseId: string;
  readonly metadata?: Record<string, unknown>;
}

export interface AuthService {
  readonly authenticate: (
    token: string,
    databaseId: string,
    documentId: string,
  ) => Effect.Effect<AuthContext, AuthenticationError>;
}

export class AuthServiceTag extends ServiceMap.Service<AuthServiceTag, AuthService>()(
  "@voidhash/mimic-host/AuthService",
) {}

export const AuthServiceLive = Layer.effect(
  AuthServiceTag,
  Effect.gen(function* () {
    const dbRepo = yield* DatabaseRepositoryTag;

    return {
      authenticate: (token, databaseId, _documentId) =>
        Effect.gen(function* () {
          // Hash the token and look up the credential
          const encoder = new TextEncoder();
          const data = encoder.encode(token);
          const hashBuffer = yield* Effect.promise(() => crypto.subtle.digest("SHA-256", data));
          const hashArray = new Uint8Array(hashBuffer);
          const tokenHash = Array.from(hashArray)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");

          const credential = yield* dbRepo.findCredentialByTokenHash(tokenHash).pipe(Effect.orDie);
          if (!credential) {
            return yield* Effect.fail(new AuthenticationError({ reason: "Invalid token" }));
          }

          if (credential.databaseId !== databaseId) {
            return yield* Effect.fail(
              new AuthenticationError({ reason: "Token not valid for this database" }),
            );
          }

          return {
            userId: credential.id,
            permission: credential.permission,
            databaseId: credential.databaseId,
          };
        }),
    };
  }),
);
