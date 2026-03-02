import { Effect } from "effect";
import { RpcClient, RpcSerialization, RpcClientError, RpcMiddleware } from "effect/unstable/rpc";
import { MimicRpcs, type AuthMiddleware } from "@voidhash/mimic-protocol";
import { DatabaseHandle } from "./DatabaseHandle";
import type { DatabaseInfo, UserInfo, GrantInfo } from "./types";

export type MimicRpcRequirements =
  | RpcClient.Protocol
  | RpcSerialization.RpcSerialization
  | RpcMiddleware.ForClient<AuthMiddleware>;

const makeClient = () => RpcClient.make(MimicRpcs);

export const createDatabase = (options: {
  name: string;
  description?: string;
}) =>
  Effect.scoped(
    Effect.gen(function* () {
      const client = yield* makeClient();
      const result = yield* client.CreateDatabase({
        name: options.name,
        description: options.description,
      });
      return new DatabaseHandle(result.id, result.name, result.description);
    }),
  );

export const listDatabases = () =>
  Effect.scoped(
    Effect.gen(function* () {
      const client = yield* makeClient();
      const result = yield* client.ListDatabases(undefined as any);
      return result as unknown as DatabaseInfo[];
    }),
  );

export const deleteDatabase = (id: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const client = yield* makeClient();
      yield* client.DeleteDatabase({ id });
    }),
  );

export const database = (id: string, name = "", description: string | null = null): DatabaseHandle =>
  new DatabaseHandle(id, name, description);

export const createUser = (options: {
  username: string;
  password: string;
}) =>
  Effect.scoped(
    Effect.gen(function* () {
      const client = yield* makeClient();
      const result = yield* client.CreateUser({
        username: options.username,
        password: options.password,
      });
      return { id: result.id, username: result.username };
    }),
  );

export const listUsers = () =>
  Effect.scoped(
    Effect.gen(function* () {
      const client = yield* makeClient();
      const result = yield* client.ListUsers(undefined as any);
      return result as unknown as UserInfo[];
    }),
  );

export const deleteUser = (id: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const client = yield* makeClient();
      yield* client.DeleteUser({ id });
    }),
  );

export const grantPermission = (options: {
  userId: string;
  databaseId: string;
  permission: "read" | "write" | "admin";
}) =>
  Effect.scoped(
    Effect.gen(function* () {
      const client = yield* makeClient();
      yield* client.GrantPermission({
        userId: options.userId,
        databaseId: options.databaseId,
        permission: options.permission,
      });
    }),
  );

export const revokePermission = (options: {
  userId: string;
  databaseId: string;
}) =>
  Effect.scoped(
    Effect.gen(function* () {
      const client = yield* makeClient();
      yield* client.RevokePermission({
        userId: options.userId,
        databaseId: options.databaseId,
      });
    }),
  );

export const listGrants = (userId?: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const client = yield* makeClient();
      const result = yield* client.ListGrants({ userId });
      return result as unknown as GrantInfo[];
    }),
  );
