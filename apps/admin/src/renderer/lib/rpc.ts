import { Effect } from "effect";
import { RpcClient } from "effect/unstable/rpc";
import type { RpcClientError } from "effect/unstable/rpc/RpcClientError";
import { MimicRpcs } from "@voidhash/mimic-protocol";
import { MimicClientLayer } from "@voidhash/mimic-sdk/effect";
import type { Credentials } from "./auth";

type Client = RpcClient.FromGroup<typeof MimicRpcs, RpcClientError>;

export function runRpc<A>(
	credentials: Credentials,
	fn: (client: Client) => Effect.Effect<A, any, any>,
): Promise<A> {
	const layer = MimicClientLayer({
		url: credentials.serverUrl,
		username: credentials.username,
		password: credentials.password,
	});
	const effect = RpcClient.make(MimicRpcs).pipe(
		Effect.flatMap(fn),
		Effect.scoped,
		Effect.provide(layer),
	) as Effect.Effect<A>;
	return Effect.runPromise(effect);
}
