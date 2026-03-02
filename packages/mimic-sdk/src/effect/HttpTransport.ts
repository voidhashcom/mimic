import { Layer } from "effect";
import { RpcClient, RpcSerialization, RpcMiddleware } from "effect/unstable/rpc";
import { FetchHttpClient } from "effect/unstable/http";
import { AuthMiddleware } from "@voidhash/mimic-protocol";

export interface MimicClientConfig {
  readonly url: string;
  readonly username: string;
  readonly password: string;
  readonly timeout?: number;
}

export const MimicClientLayer = (config: MimicClientConfig) => {
  const baseUrl = config.url.replace(/\/+$/, "");
  const basicAuth = btoa(`${config.username}:${config.password}`);

  const ProtocolLive = RpcClient.layerProtocolHttp({
    url: `${baseUrl}/rpc`,
  });

  const SerializationLive = RpcSerialization.layerNdjson;

  const AuthLive = RpcMiddleware.layerClient(
    AuthMiddleware,
    ({ next, request }) =>
      next({
        ...request,
        headers: {
          ...request.headers,
          authorization: `Basic ${basicAuth}`,
        },
      }),
  );

  return Layer.mergeAll(
    ProtocolLive.pipe(
      Layer.provide(FetchHttpClient.layer),
      Layer.provide(SerializationLive),
    ),
    SerializationLive,
    AuthLive,
  );
};
