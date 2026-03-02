import { Effect } from "effect";
import { type Primitive, SchemaJSON } from "@voidhash/mimic";
import { HttpTransport } from "./HttpTransport";
import type { MimicSDKError } from "./errors";
import { CollectionHandle } from "./CollectionHandle";
import type { CollectionInfo } from "./types";

export class DatabaseHandle {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;

  constructor(id: string, name: string, description: string | null) {
    this.id = id;
    this.name = name;
    this.description = description;
  }

  createCollection<TSchema extends Primitive.AnyPrimitive>(
    name: string,
    schema: TSchema,
  ): Effect.Effect<CollectionHandle<TSchema>, MimicSDKError, HttpTransport> {
    const databaseId = this.id;
    return Effect.gen(function* () {
      const transport = yield* HttpTransport;
      const schemaJson = SchemaJSON.toJSON(schema);
      const result = yield* transport.rpc("CreateCollection", {
        databaseId,
        name,
        schemaJson,
      });
      const info = result as CollectionInfo;
      return new CollectionHandle<TSchema>(info.id, info.databaseId, schema);
    });
  }

  listCollections(): Effect.Effect<CollectionInfo[], MimicSDKError, HttpTransport> {
    const databaseId = this.id;
    return Effect.gen(function* () {
      const transport = yield* HttpTransport;
      const result = yield* transport.rpc("ListCollections", {
        databaseId,
      });
      return result as CollectionInfo[];
    });
  }

  deleteCollection(id: string): Effect.Effect<void, MimicSDKError, HttpTransport> {
    return Effect.gen(function* () {
      const transport = yield* HttpTransport;
      yield* transport.rpc("DeleteCollection", { id });
    });
  }

  collection<TSchema extends Primitive.AnyPrimitive>(
    id: string,
    schema: TSchema,
  ): CollectionHandle<TSchema> {
    return new CollectionHandle<TSchema>(id, this.id, schema);
  }

  updateCollectionSchema(
    collectionId: string,
    schemaJson: unknown,
  ): Effect.Effect<{ id: string; schemaVersion: number }, MimicSDKError, HttpTransport> {
    return Effect.gen(function* () {
      const transport = yield* HttpTransport;
      const result = yield* transport.rpc("UpdateCollectionSchema", {
        id: collectionId,
        schemaJson,
      });
      return result as { id: string; schemaVersion: number };
    });
  }
}
