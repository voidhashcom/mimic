import { Effect, Layer, ServiceMap } from "effect";
import type { DocumentToken } from "../domain/DocumentToken";
import {
  DocumentTokenNotFoundError,
  DocumentTokenExpiredError,
  DocumentTokenAlreadyUsedError,
} from "../domain/DocumentToken";
import { UserServiceError } from "../engine/Errors";
import { DocumentTokenRepositoryTag } from "../mysql/DocumentTokenRepository";

export interface DocumentTokenService {
  readonly createToken: (
    collectionId: string,
    documentId: string,
    permission: "read" | "write",
    expiresInSeconds?: number,
  ) => Effect.Effect<{ token: string }, UserServiceError>;
  readonly validateAndConsumeToken: (
    token: string,
    collectionId: string,
    documentId: string,
  ) => Effect.Effect<
    DocumentToken,
    DocumentTokenNotFoundError | DocumentTokenExpiredError | DocumentTokenAlreadyUsedError | UserServiceError
  >;
}

export class DocumentTokenServiceTag extends ServiceMap.Service<
  DocumentTokenServiceTag,
  DocumentTokenService
>()("@voidhash/mimic-host/DocumentTokenService") {}

function hashToken(token: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(token);
  return hasher.digest("hex");
}

function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const DocumentTokenServiceLive = Layer.effect(
  DocumentTokenServiceTag,
  Effect.gen(function* () {
    const repo = yield* DocumentTokenRepositoryTag;

    const mapRepoError = <A>(effect: Effect.Effect<A, any>, message: string) =>
      effect.pipe(
        Effect.mapError((cause) => new UserServiceError({ message, cause })),
      );

    return {
      createToken: (collectionId, documentId, permission, expiresInSeconds = 3600) =>
        Effect.gen(function* () {
          const id = crypto.randomUUID();
          const token = generateToken();
          const tokenHash = hashToken(token);
          const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
          yield* mapRepoError(
            repo.create(id, tokenHash, collectionId, documentId, permission, expiresAt),
            "Failed to create document token",
          );
          return { token };
        }),

      validateAndConsumeToken: (token, collectionId, documentId) =>
        Effect.gen(function* () {
          const tokenHash = hashToken(token);
          const record = yield* mapRepoError(
            repo.findByTokenHash(tokenHash),
            "Failed to look up document token",
          );
          if (!record) {
            return yield* Effect.fail(new DocumentTokenNotFoundError({ tokenHash }));
          }
          if (record.usedAt !== null) {
            return yield* Effect.fail(new DocumentTokenAlreadyUsedError({ tokenId: record.id }));
          }
          if (new Date(record.expiresAt) < new Date()) {
            return yield* Effect.fail(new DocumentTokenExpiredError({ tokenId: record.id }));
          }
          if (record.collectionId !== collectionId || record.documentId !== documentId) {
            return yield* Effect.fail(
              new DocumentTokenNotFoundError({ tokenHash: "Token does not match requested document" }),
            );
          }
          yield* mapRepoError(repo.markUsed(record.id), "Failed to mark token as used");
          return record;
        }),
    };
  }),
);
