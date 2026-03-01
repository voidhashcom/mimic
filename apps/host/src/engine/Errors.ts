import { Data } from "effect";

export class StorageError extends Data.TaggedError("StorageError")<{
  readonly operation: string;
  readonly cause: unknown;
}> {}

export class WalVersionGapError extends Data.TaggedError("WalVersionGapError")<{
  readonly documentId: string;
  readonly expectedVersion: number;
  readonly actualPreviousVersion: number | undefined;
}> {}

export class AuthenticationError extends Data.TaggedError("AuthenticationError")<{
  readonly reason: string;
}> {}

export class AuthorizationError extends Data.TaggedError("AuthorizationError")<{
  readonly reason: string;
  readonly required: "read" | "write";
  readonly actual: "read" | "write";
}> {}

export class MessageParseError extends Data.TaggedError("MessageParseError")<{
  readonly cause: unknown;
}> {}

export class TransactionRejectedError extends Data.TaggedError("TransactionRejectedError")<{
  readonly transactionId: string;
  readonly reason: string;
}> {}

export class EntityLoadError extends Data.TaggedError("EntityLoadError")<{
  readonly entityId: string;
  readonly cause: unknown;
}> {}
