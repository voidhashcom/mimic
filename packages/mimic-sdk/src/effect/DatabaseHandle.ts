import { Effect } from "effect";
import { type Primitive, SchemaJSON } from "@voidhash/mimic";
import { RpcClient } from "effect/unstable/rpc";
import { MimicRpcs } from "@voidhash/mimic-protocol";
import { CollectionHandle } from "./CollectionHandle";
import type { CollectionInfo } from "./types";

const makeClient = () => RpcClient.make(MimicRpcs);

export class DatabaseHandle {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;

  constructor(id: string, name: string, description: string | null) {
    this.id = id;
    this.name = name;
    this.description = description;
  }

  createCollection<TSchema extends Primitive.AnyPrimitive>(name: string, schema: TSchema) {
    const databaseId = this.id;
    return Effect.scoped(
      Effect.gen(function* () {
        const client = yield* makeClient();
        const schemaJson = SchemaJSON.toJSON(schema);
        const result = yield* client.CreateCollection({
          databaseId,
          name,
          schemaJson,
        });
        return new CollectionHandle<TSchema>(result.id, result.databaseId, schema);
      }),
    );
  }

  listCollections() {
    const databaseId = this.id;
    return Effect.scoped(
      Effect.gen(function* () {
        const client = yield* makeClient();
        const result = yield* client.ListCollections({ databaseId });
        return result as unknown as CollectionInfo[];
      }),
    );
  }

  deleteCollection(id: string) {
    return Effect.scoped(
      Effect.gen(function* () {
        const client = yield* makeClient();
        yield* client.DeleteCollection({ id });
      }),
    );
  }

  collection<TSchema extends Primitive.AnyPrimitive>(
    id: string,
    schema: TSchema,
  ): CollectionHandle<TSchema> {
    return new CollectionHandle<TSchema>(id, this.id, schema);
  }

  updateCollectionSchema(collectionId: string, schemaJson: unknown) {
    return Effect.scoped(
      Effect.gen(function* () {
        const client = yield* makeClient();
        const result = yield* client.UpdateCollectionSchema({
          id: collectionId,
          schemaJson,
        });
        return { id: result.id, schemaVersion: result.schemaVersion };
      }),
    );
  }
}
