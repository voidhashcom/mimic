import { Effect, Layer } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import { AuthServiceTag, type RpcAuthContext } from "../auth/AuthService";
import { handleRpc } from "./RpcRouter";

export { type RpcAuthContext } from "../auth/AuthService";

export const RpcRoute = Layer.effectDiscard(
  Effect.gen(function* () {
    const router = yield* HttpRouter.HttpRouter;
    const authService = yield* AuthServiceTag;

    yield* router.add(
      "POST",
      "/rpc",
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;

        // Parse Basic auth header
        let authContext: RpcAuthContext | undefined;
        const authHeader = request.headers["authorization"];

        if (authHeader && authHeader.startsWith("Basic ")) {
          const decoded = atob(authHeader.slice(6));
          const colonIndex = decoded.indexOf(":");
          if (colonIndex > 0) {
            const username = decoded.slice(0, colonIndex);
            const password = decoded.slice(colonIndex + 1);
            const result = yield* Effect.result(
              authService.authenticateBasic(username, password),
            );
            if (result._tag === "Success") {
              authContext = result.success;
            }
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
