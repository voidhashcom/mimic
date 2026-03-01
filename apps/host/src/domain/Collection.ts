import { Data } from "effect";

export interface Collection {
  readonly id: string;
  readonly databaseId: string;
  readonly name: string;
  readonly schemaJson: unknown;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class CollectionNotFoundError extends Data.TaggedError("CollectionNotFoundError")<{
  readonly collectionId: string;
}> {}

export class CollectionAlreadyExistsError extends Data.TaggedError("CollectionAlreadyExistsError")<{
  readonly databaseId: string;
  readonly name: string;
}> {}
