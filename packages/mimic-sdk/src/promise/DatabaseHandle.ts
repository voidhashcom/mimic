import type { ManagedRuntime } from "effect";
import type { Primitive } from "@voidhash/mimic";
import { DatabaseHandle as EffectDatabaseHandle } from "../effect/DatabaseHandle";
import type { MimicRpcRequirements } from "../effect/MimicSDK";
import type { CollectionInfo } from "../effect/types";
import { CollectionHandle } from "./CollectionHandle";

export class DatabaseHandle {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  private readonly _effect: EffectDatabaseHandle;
  private readonly _runtime: ManagedRuntime.ManagedRuntime<MimicRpcRequirements, never>;

  constructor(
    id: string,
    name: string,
    description: string,
    runtime: ManagedRuntime.ManagedRuntime<MimicRpcRequirements, never>,
  ) {
    this.id = id;
    this.name = name;
    this.description = description;
    this._effect = new EffectDatabaseHandle(id, name, description);
    this._runtime = runtime;
  }

  async createCollection<TSchema extends Primitive.AnyPrimitive>(
    name: string,
    schema: TSchema,
  ): Promise<CollectionHandle<TSchema>> {
    const info = await this._runtime.runPromise(this._effect.createCollection(name, schema));
    return new CollectionHandle<TSchema>(info.id, info.databaseId, schema, this._runtime);
  }

  async listCollections(): Promise<CollectionInfo[]> {
    return this._runtime.runPromise(this._effect.listCollections());
  }

  async deleteCollection(id: string): Promise<void> {
    return this._runtime.runPromise(this._effect.deleteCollection(id)) as Promise<void>;
  }

  collection<TSchema extends Primitive.AnyPrimitive>(
    id: string,
    schema: TSchema,
  ): CollectionHandle<TSchema> {
    return new CollectionHandle<TSchema>(id, this.id, schema, this._runtime);
  }
}
