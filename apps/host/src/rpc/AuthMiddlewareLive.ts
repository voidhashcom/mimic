import { Effect, Layer } from "effect";
import { AuthMiddleware, CurrentUser } from "@voidhash/mimic-protocol";
import { AuthServiceTag } from "../auth/AuthService";

export const AuthMiddlewareLive = Layer.effect(
  AuthMiddleware,
  Effect.gen(function* () {
    const authService = yield* AuthServiceTag;

    return (effect, { headers }) =>
      Effect.gen(function* () {
        const authHeader = headers["authorization"] ?? headers["Authorization"];
        if (!authHeader || !authHeader.startsWith("Basic ")) {
          return yield* Effect.fail("Authentication required. Provide Authorization: Basic header.");
        }

        const decoded = atob(authHeader.slice(6));
        const colonIndex = decoded.indexOf(":");
        if (colonIndex <= 0) {
          return yield* Effect.fail("Invalid Basic auth header format");
        }

        const username = decoded.slice(0, colonIndex);
        const password = decoded.slice(colonIndex + 1);

        const authResult = yield* authService.authenticateBasic(username, password).pipe(
          Effect.mapError(() => "Invalid credentials"),
        );

        return yield* Effect.provideService(effect, CurrentUser, {
          userId: authResult.userId,
          username: authResult.username,
          isSuperuser: authResult.isSuperuser,
        });
      });
  }),
);
