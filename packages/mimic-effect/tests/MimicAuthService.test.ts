import { describe, it, expect } from "vitest";
import { Effect, Layer, Context } from "effect";
import {
  MimicAuthService,
  MimicAuthServiceTag,
} from "../src/MimicAuthService.js";
import { AuthenticationError } from "../src/Errors.js";

describe("MimicAuthService", () => {
  describe("NoAuth", () => {
    const layer = MimicAuthService.NoAuth.make();

    it("should authenticate any token with write permission", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const auth = yield* MimicAuthServiceTag;
          return yield* auth.authenticate("any-token", "any-doc");
        }).pipe(Effect.provide(layer))
      );

      expect(result.userId).toBe("anonymous");
      expect(result.permission).toBe("write");
    });

    it("should work with empty token", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const auth = yield* MimicAuthServiceTag;
          return yield* auth.authenticate("", "doc-1");
        }).pipe(Effect.provide(layer))
      );

      expect(result.userId).toBe("anonymous");
      expect(result.permission).toBe("write");
    });
  });

  describe("Static", () => {
    it("should return configured permissions", async () => {
      const layer = MimicAuthService.Static.make({
        permissions: {
          "user-1": "write",
          "user-2": "read",
        },
      });

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const auth = yield* MimicAuthServiceTag;
          const result1 = yield* auth.authenticate("user-1", "doc-1");
          const result2 = yield* auth.authenticate("user-2", "doc-1");
          return { result1, result2 };
        }).pipe(Effect.provide(layer))
      );

      expect(result.result1.userId).toBe("user-1");
      expect(result.result1.permission).toBe("write");
      expect(result.result2.userId).toBe("user-2");
      expect(result.result2.permission).toBe("read");
    });

    it("should use default permission for unknown users", async () => {
      const layer = MimicAuthService.Static.make({
        permissions: {
          "user-1": "write",
        },
        defaultPermission: "read",
      });

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const auth = yield* MimicAuthServiceTag;
          return yield* auth.authenticate("unknown-user", "doc-1");
        }).pipe(Effect.provide(layer))
      );

      expect(result.userId).toBe("unknown-user");
      expect(result.permission).toBe("read");
    });

    it("should fail for unknown users without default permission", async () => {
      const layer = MimicAuthService.Static.make({
        permissions: {
          "user-1": "write",
        },
      });

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const auth = yield* MimicAuthServiceTag;
          return yield* Effect.either(
            auth.authenticate("unknown-user", "doc-1")
          );
        }).pipe(Effect.provide(layer))
      );

      expect(result._tag).toBe("Left");
      if (result._tag === "Left") {
        expect(result.left).toBeInstanceOf(AuthenticationError);
        expect(result.left.reason).toBe("Unknown user");
      }
    });
  });

  describe("make (custom)", () => {
    it("should allow custom implementation with service access", async () => {
      // Create a mock service
      class MockDatabaseTag extends Context.Tag("MockDatabase")<
        MockDatabaseTag,
        { getPermission: (userId: string) => Effect.Effect<"read" | "write"> }
      >() {}

      const mockDbLayer = Layer.succeed(MockDatabaseTag, {
        getPermission: (userId: string) =>
          Effect.succeed(userId === "admin" ? "write" : "read"),
      });

      const authLayer = MimicAuthService.make(
        Effect.gen(function* () {
          const db = yield* MockDatabaseTag;

          return {
            authenticate: (token: string, _documentId: string) =>
              Effect.gen(function* () {
                const permission = yield* db.getPermission(token);
                return { userId: token, permission };
              }),
          };
        })
      ).pipe(Layer.provide(mockDbLayer));

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const auth = yield* MimicAuthServiceTag;
          const admin = yield* auth.authenticate("admin", "doc-1");
          const user = yield* auth.authenticate("user", "doc-1");
          return { admin, user };
        }).pipe(Effect.provide(authLayer))
      );

      expect(result.admin.permission).toBe("write");
      expect(result.user.permission).toBe("read");
    });
  });

  describe("Tag", () => {
    it("should have correct identifier", () => {
      expect(MimicAuthServiceTag.key).toBe(
        "@voidhash/mimic-effect/MimicAuthService"
      );
    });
  });
});
