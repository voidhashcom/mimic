import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import * as MimicAuthService from "../src/MimicAuthService";

// =============================================================================
// MimicAuthService Tests
// =============================================================================

describe("MimicAuthService", () => {
  describe("make", () => {
    it("should create auth service with sync handler", async () => {
      const authService = MimicAuthService.make((token) => ({
        success: true,
        userId: `user-${token}`,
      }));

      const result = await Effect.runPromise(
        authService.authenticate("test-token")
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.userId).toBe("user-test-token");
      }
    });

    it("should create auth service with async handler", async () => {
      const authService = MimicAuthService.make(async (token) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { success: true, userId: `async-${token}` };
      });

      const result = await Effect.runPromise(
        authService.authenticate("async-token")
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.userId).toBe("async-async-token");
      }
    });

    it("should handle auth failure", async () => {
      const authService = MimicAuthService.make((_token) => ({
        success: false,
        error: "Invalid token",
      }));

      const result = await Effect.runPromise(
        authService.authenticate("bad-token")
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Invalid token");
      }
    });

    it("should handle success without userId", async () => {
      const authService = MimicAuthService.make((_token) => ({
        success: true,
      }));

      const result = await Effect.runPromise(
        authService.authenticate("token")
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.userId).toBeUndefined();
      }
    });
  });

  describe("makeEffect", () => {
    it("should create auth service from Effect-based authenticate function", async () => {
      const authService = MimicAuthService.makeEffect((token) =>
        Effect.succeed({ success: true as const, userId: `effect-${token}` })
      );

      const result = await Effect.runPromise(
        authService.authenticate("effect-token")
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.userId).toBe("effect-effect-token");
      }
    });

    it("should support Effect operations in authenticate", async () => {
      const authService = MimicAuthService.makeEffect((token) =>
        Effect.gen(function* () {
          yield* Effect.sleep(10);
          return { success: true as const, userId: `delayed-${token}` };
        })
      );

      const result = await Effect.runPromise(
        authService.authenticate("delay-token")
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.userId).toBe("delayed-delay-token");
      }
    });
  });

  describe("layer", () => {
    it("should create a layer from auth handler", async () => {
      const testLayer = MimicAuthService.layer({
        authHandler: (token) => ({ success: true, userId: `layer-${token}` }),
      });

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const authService = yield* MimicAuthService.MimicAuthServiceTag;
          return yield* authService.authenticate("layer-token");
        }).pipe(Effect.provide(testLayer))
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.userId).toBe("layer-layer-token");
      }
    });
  });

  describe("layerService", () => {
    it("should create a layer from service implementation", async () => {
      const service = MimicAuthService.make((token) => ({
        success: true,
        userId: `service-${token}`,
      }));

      const testLayer = MimicAuthService.layerService(service);

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const authService = yield* MimicAuthService.MimicAuthServiceTag;
          return yield* authService.authenticate("service-token");
        }).pipe(Effect.provide(testLayer))
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.userId).toBe("service-service-token");
      }
    });
  });

  describe("layerEffect", () => {
    it("should create a layer from an Effect", async () => {
      const testLayer = MimicAuthService.layerEffect(
        Effect.succeed(
          MimicAuthService.make((token) => ({
            success: true,
            userId: `effect-layer-${token}`,
          }))
        )
      );

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const authService = yield* MimicAuthService.MimicAuthServiceTag;
          return yield* authService.authenticate("effect-layer-token");
        }).pipe(Effect.provide(testLayer))
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.userId).toBe("effect-layer-effect-layer-token");
      }
    });
  });

  describe("MimicAuthServiceTag", () => {
    it("should have the correct tag identifier", () => {
      expect(MimicAuthService.MimicAuthServiceTag.key).toBe(
        "@voidhash/mimic-server-effect/MimicAuthService"
      );
    });
  });
});
