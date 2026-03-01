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
  readonly required: "read" | "write" | "admin";
  readonly actual: "read" | "write" | "admin";
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

export class DatabaseServiceError extends Data.TaggedError("DatabaseServiceError")<{
  readonly message: string;
  readonly cause: unknown;
}> {}

export class CollectionServiceError extends Data.TaggedError("CollectionServiceError")<{
  readonly message: string;
  readonly cause: unknown;
}> {}

export class AuthServiceError extends Data.TaggedError("AuthServiceError")<{
  readonly message: string;
  readonly cause: unknown;
}> {}

export class DocumentGatewayError extends Data.TaggedError("DocumentGatewayError")<{
  readonly message: string;
  readonly cause: unknown;
}> {}
