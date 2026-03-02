import { Effect } from "effect";
import type { Primitive } from "@voidhash/mimic";
import { RpcClient } from "effect/unstable/rpc";
import { MimicRpcs } from "@voidhash/mimic-protocol";
import type { DocumentSnapshot, CreatedDocumentToken } from "./types";

const makeClient = () => RpcClient.make(MimicRpcs);

export class CollectionHandle<TSchema extends Primitive.AnyPrimitive> {
  readonly id: string;
  readonly databaseId: string;
  readonly schema: TSchema;

  constructor(id: string, databaseId: string, schema: TSchema) {
    this.id = id;
    this.databaseId = databaseId;
    this.schema = schema;
  }

  create(data: Primitive.InferSetInput<TSchema>, options?: { id?: string }) {
    const collectionId = this.id;
    return Effect.scoped(
      Effect.gen(function* () {
        const client = yield* makeClient();
        const result = yield* client.CreateDocument({
          collectionId,
          id: options?.id,
          data,
        });
        return result as unknown as DocumentSnapshot<Primitive.InferState<TSchema>>;
      }),
    );
  }

  get(documentId: string) {
    const collectionId = this.id;
    return Effect.scoped(
      Effect.gen(function* () {
        const client = yield* makeClient();
        const result = yield* client.GetDocument({
          collectionId,
          documentId,
        });
        return result as unknown as DocumentSnapshot<Primitive.InferState<TSchema>>;
      }),
    );
  }

  update(documentId: string, data: Primitive.InferUpdateInput<TSchema>) {
    const collectionId = this.id;
    return Effect.scoped(
      Effect.gen(function* () {
        const client = yield* makeClient();
        const result = yield* client.UpdateDocument({
          collectionId,
          documentId,
          data,
        });
        return { id: result.id, version: result.version };
      }),
    );
  }

  set(documentId: string, data: Primitive.InferSetInput<TSchema>) {
    const collectionId = this.id;
    return Effect.scoped(
      Effect.gen(function* () {
        const client = yield* makeClient();
        const result = yield* client.SetDocument({
          collectionId,
          documentId,
          data,
        });
        return { id: result.id, version: result.version };
      }),
    );
  }

  delete(documentId: string) {
    const collectionId = this.id;
    return Effect.scoped(
      Effect.gen(function* () {
        const client = yield* makeClient();
        yield* client.DeleteDocument({
          collectionId,
          documentId,
        });
      }),
    );
  }

  list() {
    const collectionId = this.id;
    return Effect.scoped(
      Effect.gen(function* () {
        const client = yield* makeClient();
        const result = yield* client.ListDocuments({
          collectionId,
        });
        return result as unknown as DocumentSnapshot<Primitive.InferState<TSchema>>[];
      }),
    );
  }

  createDocumentToken(documentId: string, permission: "read" | "write", expiresInSeconds?: number) {
    const collectionId = this.id;
    return Effect.scoped(
      Effect.gen(function* () {
        const client = yield* makeClient();
        const result = yield* client.CreateDocumentToken({
          collectionId,
          documentId,
          permission,
          expiresInSeconds,
        });
        return { token: result.token } as CreatedDocumentToken;
      }),
    );
  }
}
