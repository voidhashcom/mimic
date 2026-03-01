import { Effect, Layer } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import { DatabaseRepositoryTag } from "../mysql/DatabaseRepository";
import { handleRpc } from "./RpcRouter";
import type { DatabaseCredential } from "../domain/Database";

const hashApiKey = (apiKey: string) =>
  Effect.gen(function* () {
    const encoder = new TextEncoder();
    const data = encoder.encode(apiKey);
    const hashBuffer = yield* Effect.promise(() => crypto.subtle.digest("SHA-256", data));
    const hashArray = new Uint8Array(hashBuffer);
    return Array.from(hashArray)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  });

export interface RpcAuthContext {
  readonly credential: DatabaseCredential;
}

export const RpcRoute = Layer.effectDiscard(
  Effect.gen(function* () {
    const router = yield* HttpRouter.HttpRouter;
    const dbRepo = yield* DatabaseRepositoryTag;

    yield* router.add(
      "POST",
      "/rpc",
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;

        // Extract API key from header
        const apiKey = request.headers["x-api-key"];
        let authContext: RpcAuthContext | undefined;

        if (apiKey) {
          const tokenHash = yield* hashApiKey(apiKey);
          const credential = yield* dbRepo.findCredentialByTokenHash(tokenHash).pipe(
            Effect["catch"](() => Effect.succeed(undefined)),
          );
          if (credential) {
            authContext = { credential };
          }
        }

        const bodyResult = yield* Effect.result(request.json);
        if (bodyResult._tag === "Failure") {
          return yield* HttpServerResponse.json({ error: "Invalid JSON body" }, { status: 400 });
        }
        const body = bodyResult.success;

        const { method, payload } = body as { method: string; payload?: unknown };
        if (!method) {
          return yield* HttpServerResponse.json({ error: "Missing 'method' field" }, { status: 400 });
        }

        return yield* handleRpc(method, payload ?? {}, authContext).pipe(
          Effect.flatMap((data: unknown) => HttpServerResponse.json({ success: true, data })),
          Effect["catch"]((err: unknown) => {
            const errObj = err as { error?: string };
            return HttpServerResponse.json(
              { success: false, error: errObj.error ?? String(err) },
              { status: 400 },
            );
          }),
        );
      }),
    );
  }),
);
