import { Schema, ServiceMap } from "effect";
import { RpcMiddleware } from "effect/unstable/rpc";

export interface CurrentUserShape {
  readonly userId: string;
  readonly username: string;
  readonly isSuperuser: boolean;
}

export class CurrentUser extends ServiceMap.Service<CurrentUser, CurrentUserShape>()(
  "@voidhash/mimic-protocol/CurrentUser",
) {}

export class AuthMiddleware extends RpcMiddleware.Service<AuthMiddleware, {
  provides: CurrentUser;
}>()("AuthMiddleware", {
  error: Schema.String,
  requiredForClient: true,
}) {}
