import { Data } from "effect";

export interface Database {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface DatabaseCredential {
  readonly id: string;
  readonly databaseId: string;
  readonly label: string;
  readonly tokenHash: string;
  readonly permission: "read" | "write" | "admin";
  readonly createdAt: Date;
}

export class DatabaseNotFoundError extends Data.TaggedError("DatabaseNotFoundError")<{
  readonly databaseId: string;
}> {}

export class DatabaseAlreadyExistsError extends Data.TaggedError("DatabaseAlreadyExistsError")<{
  readonly name: string;
}> {}

export class CredentialNotFoundError extends Data.TaggedError("CredentialNotFoundError")<{
  readonly credentialId: string;
}> {}
