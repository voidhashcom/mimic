import { ManagedRuntime } from "effect";
import { HttpTransport, type HttpTransportConfig } from "../effect/HttpTransport";
import type { MimicSDKError } from "../effect/errors";
import * as EffectMimicSDK from "../effect/MimicSDK";
import type { DatabaseInfo, UserInfo, GrantInfo } from "../effect/types";
import { DatabaseHandle } from "./DatabaseHandle";

export class MimicSDK {
  private readonly _runtime: ManagedRuntime.ManagedRuntime<HttpTransport, MimicSDKError>;

  private constructor(runtime: ManagedRuntime.ManagedRuntime<HttpTransport, MimicSDKError>) {
    this._runtime = runtime;
  }

  static create(options: HttpTransportConfig): MimicSDK {
    const layer = HttpTransport.layer(options);
    const runtime = ManagedRuntime.make(layer) as ManagedRuntime.ManagedRuntime<HttpTransport, MimicSDKError>;
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
    return this._runtime.runPromise(EffectMimicSDK.deleteDatabase(id));
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
    return this._runtime.runPromise(EffectMimicSDK.deleteUser(id));
  }

  async grantPermission(options: {
    userId: string;
    databaseId: string;
    permission: "read" | "write" | "admin";
  }): Promise<void> {
    return this._runtime.runPromise(EffectMimicSDK.grantPermission(options));
  }

  async revokePermission(options: { userId: string; databaseId: string }): Promise<void> {
    return this._runtime.runPromise(EffectMimicSDK.revokePermission(options));
  }

  async listGrants(userId?: string): Promise<GrantInfo[]> {
    return this._runtime.runPromise(EffectMimicSDK.listGrants(userId));
  }

  async dispose(): Promise<void> {
    return this._runtime.dispose();
  }
}
