import { Effect, Layer, ServiceMap } from "effect";
import { MimicSDKError } from "./errors";

export interface HttpTransportConfig {
  readonly url: string;
  readonly apiKey?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly timeout?: number;
}

export interface HttpTransportShape {
  readonly rpc: (method: string, payload?: Record<string, unknown>) => Effect.Effect<unknown, MimicSDKError>;
}

export class HttpTransport extends ServiceMap.Service<HttpTransport, HttpTransportShape>()(
  "@voidhash/mimic-sdk/HttpTransport",
) {
  static layer(config: HttpTransportConfig): Layer.Layer<HttpTransport> {
    const fetchFn = config.fetch ?? globalThis.fetch;
    const timeout = config.timeout ?? 30000;
    const baseUrl = config.url.replace(/\/+$/, "");

    return Layer.succeed(
      HttpTransport,
      {
        rpc: (method, payload) =>
          Effect.gen(function* () {
            const headers: Record<string, string> = {
              "Content-Type": "application/json",
            };
            if (config.apiKey) {
              headers["X-API-Key"] = config.apiKey;
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = yield* Effect.tryPromise({
              try: () =>
                fetchFn(`${baseUrl}/rpc`, {
                  method: "POST",
                  headers,
                  body: JSON.stringify({ method, payload: payload ?? {} }),
                  signal: controller.signal,
                }),
              catch: (cause) =>
                new MimicSDKError({
                  message: `Network error calling ${method}: ${cause}`,
                  method,
                  cause,
                }),
            }).pipe(Effect.ensuring(Effect.sync(() => clearTimeout(timeoutId))));

            const body = yield* Effect.tryPromise({
              try: () => response.json() as Promise<{ success: boolean; data?: unknown; error?: string }>,
              catch: (cause) =>
                new MimicSDKError({
                  message: `Failed to parse response for ${method}`,
                  method,
                  cause,
                }),
            });

            if (!body.success) {
              return yield* Effect.fail(
                new MimicSDKError({
                  message: body.error ?? `RPC ${method} failed`,
                  method,
                }),
              );
            }

            return body.data;
          }),
      },
    );
  }
}
