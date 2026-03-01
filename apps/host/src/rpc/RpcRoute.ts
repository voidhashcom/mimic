import { Effect, Layer } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import { handleRpc } from "./RpcRouter";

export const RpcRoute = Layer.effectDiscard(
  Effect.gen(function* () {
    const router = yield* HttpRouter.HttpRouter;

    yield* router.add(
      "POST",
      "/rpc",
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const body = yield* request.json.pipe(Effect.orDie);

        const { method, payload } = body as { method: string; payload?: unknown };
        if (!method) {
          return yield* HttpServerResponse.json({ error: "Missing 'method' field" }, { status: 400 });
        }

        return yield* handleRpc(method, payload ?? {}).pipe(
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
