import { Effect } from "effect";
import { HttpTransport } from "./HttpTransport";
import { MimicSDKError } from "./errors";
import { DatabaseHandle } from "./DatabaseHandle";
import type { DatabaseInfo, UserInfo, GrantInfo } from "./types";

export const createDatabase = (options: {
  name: string;
  description?: string;
}): Effect.Effect<DatabaseHandle, MimicSDKError, HttpTransport> =>
  Effect.gen(function* () {
    const transport = yield* HttpTransport;
    const result = yield* transport.rpc("CreateDatabase", {
      name: options.name,
      description: options.description,
    });
    const info = result as DatabaseInfo;
    return new DatabaseHandle(info.id, info.name, info.description);
  });

export const listDatabases = (): Effect.Effect<DatabaseInfo[], MimicSDKError, HttpTransport> =>
  Effect.gen(function* () {
    const transport = yield* HttpTransport;
    const result = yield* transport.rpc("ListDatabases");
    return result as DatabaseInfo[];
  });

export const deleteDatabase = (id: string): Effect.Effect<void, MimicSDKError, HttpTransport> =>
  Effect.gen(function* () {
    const transport = yield* HttpTransport;
    yield* transport.rpc("DeleteDatabase", { id });
  });

export const database = (id: string, name = "", description: string | null = null): DatabaseHandle =>
  new DatabaseHandle(id, name, description);

export const createUser = (options: {
  username: string;
  password: string;
}): Effect.Effect<{ id: string; username: string }, MimicSDKError, HttpTransport> =>
  Effect.gen(function* () {
    const transport = yield* HttpTransport;
    const result = yield* transport.rpc("CreateUser", {
      username: options.username,
      password: options.password,
    });
    return result as { id: string; username: string };
  });

export const listUsers = (): Effect.Effect<UserInfo[], MimicSDKError, HttpTransport> =>
  Effect.gen(function* () {
    const transport = yield* HttpTransport;
    const result = yield* transport.rpc("ListUsers");
    return result as UserInfo[];
  });

export const deleteUser = (id: string): Effect.Effect<void, MimicSDKError, HttpTransport> =>
  Effect.gen(function* () {
    const transport = yield* HttpTransport;
    yield* transport.rpc("DeleteUser", { id });
  });

export const grantPermission = (options: {
  userId: string;
  databaseId: string;
  permission: "read" | "write" | "admin";
}): Effect.Effect<void, MimicSDKError, HttpTransport> =>
  Effect.gen(function* () {
    const transport = yield* HttpTransport;
    yield* transport.rpc("GrantPermission", {
      userId: options.userId,
      databaseId: options.databaseId,
      permission: options.permission,
    });
  });

export const revokePermission = (options: {
  userId: string;
  databaseId: string;
}): Effect.Effect<void, MimicSDKError, HttpTransport> =>
  Effect.gen(function* () {
    const transport = yield* HttpTransport;
    yield* transport.rpc("RevokePermission", {
      userId: options.userId,
      databaseId: options.databaseId,
    });
  });

export const listGrants = (
  userId?: string,
): Effect.Effect<GrantInfo[], MimicSDKError, HttpTransport> =>
  Effect.gen(function* () {
    const transport = yield* HttpTransport;
    const result = yield* transport.rpc("ListGrants", { userId });
    return result as GrantInfo[];
  });
