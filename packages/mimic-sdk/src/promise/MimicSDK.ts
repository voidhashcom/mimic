import { ManagedRuntime } from "effect";
import { MimicClientLayer, type MimicClientConfig } from "../effect/HttpTransport";
import type { MimicRpcRequirements } from "../effect/MimicSDK";
import * as EffectMimicSDK from "../effect/MimicSDK";
import type { DatabaseInfo, UserInfo, GrantInfo } from "../effect/types";
import { DatabaseHandle } from "./DatabaseHandle";

export class MimicSDK {
  private readonly _runtime: ManagedRuntime.ManagedRuntime<MimicRpcRequirements, never>;

  private constructor(runtime: ManagedRuntime.ManagedRuntime<MimicRpcRequirements, never>) {
    this._runtime = runtime;
  }

  static create(options: MimicClientConfig): MimicSDK {
    const layer = MimicClientLayer(options);
    const runtime = ManagedRuntime.make(layer) as ManagedRuntime.ManagedRuntime<MimicRpcRequirements, never>;
    return new MimicSDK(runtime);
  }

  async createDatabase(options: { name: string; description?: string }): Promise<DatabaseHandle> {
    const result = await this._runtime.runPromise(EffectMimicSDK.createDatabase(options));
    return new DatabaseHandle(result.id, result.name, result.description, this._runtime);
  }

  async listDatabases(): Promise<DatabaseInfo[]> {
    return this._runtime.runPromise(EffectMimicSDK.listDatabases());
  }

  async deleteDatabase(id: string): Promise<void> {
    return this._runtime.runPromise(EffectMimicSDK.deleteDatabase(id)) as Promise<void>;
  }

  database(id: string, name = "", description: string | null = null): DatabaseHandle {
    return new DatabaseHandle(id, name, description, this._runtime);
  }

  async createUser(options: { username: string; password: string }): Promise<{ id: string; username: string }> {
    return this._runtime.runPromise(EffectMimicSDK.createUser(options));
  }

  async listUsers(): Promise<UserInfo[]> {
    return this._runtime.runPromise(EffectMimicSDK.listUsers());
  }

  async deleteUser(id: string): Promise<void> {
    return this._runtime.runPromise(EffectMimicSDK.deleteUser(id)) as Promise<void>;
  }

  async grantPermission(options: {
    userId: string;
    databaseId: string;
    permission: "read" | "write" | "admin";
  }): Promise<void> {
    return this._runtime.runPromise(EffectMimicSDK.grantPermission(options)) as Promise<void>;
  }

  async revokePermission(options: { userId: string; databaseId: string }): Promise<void> {
    return this._runtime.runPromise(EffectMimicSDK.revokePermission(options)) as Promise<void>;
  }

  async listGrants(userId?: string): Promise<GrantInfo[]> {
    return this._runtime.runPromise(EffectMimicSDK.listGrants(userId));
  }

  async dispose(): Promise<void> {
    return this._runtime.dispose();
  }
}
