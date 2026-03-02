import { Data } from "effect";

export interface DocumentToken {
  readonly id: string;
  readonly tokenHash: string;
  readonly collectionId: string;
  readonly documentId: string;
  readonly permission: "read" | "write";
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
  readonly createdAt: Date;
}

export class DocumentTokenNotFoundError extends Data.TaggedError("DocumentTokenNotFoundError")<{
  readonly tokenHash: string;
}> {}

export class DocumentTokenExpiredError extends Data.TaggedError("DocumentTokenExpiredError")<{
  readonly tokenId: string;
}> {}

export class DocumentTokenAlreadyUsedError extends Data.TaggedError("DocumentTokenAlreadyUsedError")<{
  readonly tokenId: string;
}> {}
