import { Data } from "effect";

export interface Database {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class DatabaseNotFoundError extends Data.TaggedError("DatabaseNotFoundError")<{
  readonly databaseId: string;
}> {}

export class DatabaseAlreadyExistsError extends Data.TaggedError("DatabaseAlreadyExistsError")<{
  readonly name: string;
}> {}
