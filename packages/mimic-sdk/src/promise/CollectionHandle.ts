import type { ManagedRuntime } from "effect";
import type { Primitive } from "@voidhash/mimic";
import { CollectionHandle as EffectCollectionHandle } from "../effect/CollectionHandle";
import type { HttpTransport } from "../effect/HttpTransport";
import type { MimicSDKError } from "../effect/errors";
import type { DocumentSnapshot } from "../effect/types";

export class CollectionHandle<TSchema extends Primitive.AnyPrimitive> {
  readonly id: string;
  readonly databaseId: string;
  readonly schema: TSchema;
  private readonly _effect: EffectCollectionHandle<TSchema>;
  private readonly _runtime: ManagedRuntime.ManagedRuntime<HttpTransport, MimicSDKError>;

  constructor(
    id: string,
    databaseId: string,
    schema: TSchema,
    runtime: ManagedRuntime.ManagedRuntime<HttpTransport, MimicSDKError>,
  ) {
    this.id = id;
    this.databaseId = databaseId;
    this.schema = schema;
    this._effect = new EffectCollectionHandle(id, databaseId, schema);
    this._runtime = runtime;
  }

  async create(
    data: Primitive.InferSetInput<TSchema>,
    options?: { id?: string },
  ): Promise<DocumentSnapshot<Primitive.InferState<TSchema>>> {
    return this._runtime.runPromise(this._effect.create(data, options));
  }

  async get(documentId: string): Promise<DocumentSnapshot<Primitive.InferState<TSchema>>> {
    return this._runtime.runPromise(this._effect.get(documentId));
  }

  async update(
    documentId: string,
    data: Primitive.InferUpdateInput<TSchema>,
  ): Promise<{ id: string; version: number }> {
    return this._runtime.runPromise(this._effect.update(documentId, data));
  }

  async set(
    documentId: string,
    data: Primitive.InferSetInput<TSchema>,
  ): Promise<{ id: string; version: number }> {
    return this._runtime.runPromise(this._effect.set(documentId, data));
  }

  async delete(documentId: string): Promise<void> {
    return this._runtime.runPromise(this._effect.delete(documentId));
  }

  async list(): Promise<DocumentSnapshot<Primitive.InferState<TSchema>>[]> {
    return this._runtime.runPromise(this._effect.list());
  }
}
