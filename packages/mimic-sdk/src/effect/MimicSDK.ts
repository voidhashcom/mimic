import { Effect } from "effect";
import { HttpTransport } from "./HttpTransport";
import { MimicSDKError } from "./errors";
import { DatabaseHandle } from "./DatabaseHandle";
import type { DatabaseInfo } from "./types";

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
