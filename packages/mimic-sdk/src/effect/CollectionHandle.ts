import { Effect } from "effect";
import type { Primitive } from "@voidhash/mimic";
import { HttpTransport } from "./HttpTransport";
import type { MimicSDKError } from "./errors";
import type { DocumentSnapshot } from "./types";

export class CollectionHandle<TSchema extends Primitive.AnyPrimitive> {
  readonly id: string;
  readonly databaseId: string;
  readonly schema: TSchema;

  constructor(id: string, databaseId: string, schema: TSchema) {
    this.id = id;
    this.databaseId = databaseId;
    this.schema = schema;
  }

  create(
    data: Primitive.InferSetInput<TSchema>,
    options?: { id?: string },
  ): Effect.Effect<DocumentSnapshot<Primitive.InferState<TSchema>>, MimicSDKError, HttpTransport> {
    const collectionId = this.id;
    return Effect.gen(function* () {
      const transport = yield* HttpTransport;
      const result = yield* transport.rpc("CreateDocument", {
        collectionId,
        id: options?.id,
        data,
      });
      return result as DocumentSnapshot<Primitive.InferState<TSchema>>;
    });
  }

  get(
    documentId: string,
  ): Effect.Effect<DocumentSnapshot<Primitive.InferState<TSchema>>, MimicSDKError, HttpTransport> {
    const collectionId = this.id;
    return Effect.gen(function* () {
      const transport = yield* HttpTransport;
      const result = yield* transport.rpc("GetDocument", {
        collectionId,
        documentId,
      });
      return result as DocumentSnapshot<Primitive.InferState<TSchema>>;
    });
  }

  update(
    documentId: string,
    data: Primitive.InferUpdateInput<TSchema>,
  ): Effect.Effect<{ id: string; version: number }, MimicSDKError, HttpTransport> {
    const collectionId = this.id;
    return Effect.gen(function* () {
      const transport = yield* HttpTransport;
      const result = yield* transport.rpc("UpdateDocument", {
        collectionId,
        documentId,
        data,
      });
      return result as { id: string; version: number };
    });
  }

  set(
    documentId: string,
    data: Primitive.InferSetInput<TSchema>,
  ): Effect.Effect<{ id: string; version: number }, MimicSDKError, HttpTransport> {
    const collectionId = this.id;
    return Effect.gen(function* () {
      const transport = yield* HttpTransport;
      const result = yield* transport.rpc("SetDocument", {
        collectionId,
        documentId,
        data,
      });
      return result as { id: string; version: number };
    });
  }

  delete(documentId: string): Effect.Effect<void, MimicSDKError, HttpTransport> {
    const collectionId = this.id;
    return Effect.gen(function* () {
      const transport = yield* HttpTransport;
      yield* transport.rpc("DeleteDocument", {
        collectionId,
        documentId,
      });
    });
  }

  list(): Effect.Effect<DocumentSnapshot<Primitive.InferState<TSchema>>[], MimicSDKError, HttpTransport> {
    const collectionId = this.id;
    return Effect.gen(function* () {
      const transport = yield* HttpTransport;
      const result = yield* transport.rpc("ListDocuments", {
        collectionId,
      });
      return result as DocumentSnapshot<Primitive.InferState<TSchema>>[];
    });
  }
}
