import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import * as NoAuth from "../src/auth/NoAuth";
import { MimicAuthServiceTag } from "../src/MimicAuthService";

// =============================================================================
// NoAuth Tests
// =============================================================================

describe("NoAuth", () => {
  describe("authenticate", () => {
    it("should always return success: true", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const authService = yield* MimicAuthServiceTag;
          return yield* authService.authenticate("any-token");
        }).pipe(Effect.provide(NoAuth.layer))
      );

      expect(result).toEqual({ success: true });
    });

    it("should succeed with empty token", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const authService = yield* MimicAuthServiceTag;
          return yield* authService.authenticate("");
        }).pipe(Effect.provide(NoAuth.layer))
      );

      expect(result.success).toBe(true);
    });

    it("should succeed with any arbitrary token", async () => {
      const tokens = [
        "valid-token-123",
        "invalid-token",
        "abc123xyz",
        "special!@#$%^&*()",
        "very-long-token-" + "x".repeat(1000),
      ];

      for (const token of tokens) {
        const result = await Effect.runPromise(
          Effect.gen(function* () {
            const authService = yield* MimicAuthServiceTag;
            return yield* authService.authenticate(token);
          }).pipe(Effect.provide(NoAuth.layer))
        );

        expect(result.success).toBe(true);
      }
    });

    it("should not include userId in result", async () => {
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const authService = yield* MimicAuthServiceTag;
          return yield* authService.authenticate("test-token");
        }).pipe(Effect.provide(NoAuth.layer))
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.userId).toBeUndefined();
      }
    });
  });

  describe("layer aliases", () => {
    it("should have layerDefault as an alias for layer", () => {
      expect(NoAuth.layerDefault).toBe(NoAuth.layer);
    });
  });

  describe("multiple authentications", () => {
    it("should handle multiple sequential authentications", async () => {
      const results = await Effect.runPromise(
        Effect.gen(function* () {
          const authService = yield* MimicAuthServiceTag;
          const result1 = yield* authService.authenticate("token-1");
          const result2 = yield* authService.authenticate("token-2");
          const result3 = yield* authService.authenticate("token-3");
          return [result1, result2, result3];
        }).pipe(Effect.provide(NoAuth.layer))
      );

      expect(results).toHaveLength(3);
      for (const result of results) {
        expect(result.success).toBe(true);
      }
    });
  });
});
