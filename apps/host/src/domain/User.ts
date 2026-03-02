import { Data } from "effect";

export interface User {
  readonly id: string;
  readonly username: string;
  readonly passwordHash: string;
  readonly isSuperuser: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface UserGrant {
  readonly id: string;
  readonly userId: string;
  readonly databaseId: string;
  readonly permission: "read" | "write" | "admin";
  readonly createdAt: Date;
}

export class UserNotFoundError extends Data.TaggedError("UserNotFoundError")<{
  readonly userId: string;
}> {}

export class UserAlreadyExistsError extends Data.TaggedError("UserAlreadyExistsError")<{
  readonly username: string;
}> {}

export class GrantNotFoundError extends Data.TaggedError("GrantNotFoundError")<{
  readonly userId: string;
  readonly databaseId: string;
}> {}
