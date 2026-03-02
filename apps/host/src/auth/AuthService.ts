import { Effect, Layer, ServiceMap } from "effect";
import { AuthenticationError, AuthServiceError } from "../engine/Errors";
import { UserServiceTag } from "../services/UserService";
import { DocumentTokenServiceTag } from "../services/DocumentTokenService";

export interface RpcAuthContext {
  readonly userId: string;
  readonly username: string;
  readonly isSuperuser: boolean;
}

export interface WsAuthContext {
  readonly tokenId: string;
  readonly permission: "read" | "write";
  readonly collectionId: string;
  readonly documentId: string;
}

export interface AuthService {
  readonly authenticateBasic: (
    username: string,
    password: string,
  ) => Effect.Effect<RpcAuthContext, AuthenticationError | AuthServiceError>;
  readonly authenticateDocumentToken: (
    token: string,
    collectionId: string,
    documentId: string,
  ) => Effect.Effect<WsAuthContext, AuthenticationError | AuthServiceError>;
}

export class AuthServiceTag extends ServiceMap.Service<AuthServiceTag, AuthService>()(
  "@voidhash/mimic-host/AuthService",
) {}

export const AuthServiceLive = Layer.effect(
  AuthServiceTag,
  Effect.gen(function* () {
    const userService = yield* UserServiceTag;
    const documentTokenService = yield* DocumentTokenServiceTag;

    return {
      authenticateBasic: (username, password) =>
        Effect.gen(function* () {
          const user = yield* userService.getByUsername(username).pipe(
            Effect.mapError(() => new AuthenticationError({ reason: "Invalid credentials" })),
          );

          const valid = yield* userService.verifyPassword(user, password).pipe(
            Effect.mapError((cause) => new AuthServiceError({ message: "Password verification failed", cause })),
          );

          if (!valid) {
            return yield* Effect.fail(new AuthenticationError({ reason: "Invalid credentials" }));
          }

          return {
            userId: user.id,
            username: user.username,
            isSuperuser: user.isSuperuser,
          };
        }),

      authenticateDocumentToken: (token, collectionId, documentId) =>
        Effect.gen(function* () {
          const record = yield* documentTokenService.validateAndConsumeToken(token, collectionId, documentId).pipe(
            Effect.mapError((cause) =>
              cause._tag === "DocumentTokenNotFoundError" ||
              cause._tag === "DocumentTokenExpiredError" ||
              cause._tag === "DocumentTokenAlreadyUsedError"
                ? new AuthenticationError({ reason: `Token validation failed: ${cause._tag}` })
                : new AuthServiceError({ message: "Token validation failed", cause }),
            ),
          );

          return {
            tokenId: record.id,
            permission: record.permission,
            collectionId: record.collectionId,
            documentId: record.documentId,
          };
        }),
    };
  }),
);
