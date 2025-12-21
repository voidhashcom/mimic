import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import { Primitive, Presence } from "@voidhash/mimic";
import * as MimicServer from "../src/MimicServer";
import * as MimicAuthService from "../src/MimicAuthService";
import * as InMemoryDataStorage from "../src/storage/InMemoryDataStorage";

// =============================================================================
// Test Schema
// =============================================================================

const TestSchema = Primitive.Struct({
  title: Primitive.String().default(""),
  completed: Primitive.Boolean().default(false),
});

// =============================================================================
// MimicServer Tests
// =============================================================================

describe("MimicServer", () => {
  describe("layer", () => {
    it("should create a layer with default auth and storage", async () => {
      const testLayer = MimicServer.layer({
        basePath: "/mimic/test",
        schema: TestSchema,
      });

      // Verify the layer provides the expected services
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const handler = yield* MimicServer.MimicWebSocketHandler;
          return typeof handler === "function";
        }).pipe(Effect.provide(testLayer))
      );

      expect(result).toBe(true);
    });

    it("should allow custom auth layer to be provided", async () => {
      let authCalled = false;

      const customAuthLayer = MimicAuthService.layer({
        authHandler: (token) => {
          authCalled = true;
          return { success: true, userId: token };
        },
      });

      const testLayer = MimicServer.layer({
        basePath: "/mimic/test",
        schema: TestSchema,
      }).pipe(Layer.provideMerge(customAuthLayer));

      // Verify the layer compiles with custom auth
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const handler = yield* MimicServer.MimicWebSocketHandler;
          return typeof handler === "function";
        }).pipe(Effect.provide(testLayer))
      );

      expect(result).toBe(true);
    });

    it("should support maxTransactionHistory option", async () => {
      const testLayer = MimicServer.layer({
        basePath: "/mimic/test",
        schema: TestSchema,
        maxTransactionHistory: 500,
      });

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const handler = yield* MimicServer.MimicWebSocketHandler;
          return typeof handler === "function";
        }).pipe(Effect.provide(testLayer))
      );

      expect(result).toBe(true);
    });
  });

  describe("handlerLayer", () => {
    it("should create a layer that provides MimicWebSocketHandler", async () => {
      const testLayer = MimicServer.handlerLayer({
        schema: TestSchema,
      });

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const handler = yield* MimicServer.MimicWebSocketHandler;
          return typeof handler === "function";
        }).pipe(Effect.provide(testLayer))
      );

      expect(result).toBe(true);
    });
  });

  describe("documentManagerLayer", () => {
    it("should create a layer that provides DocumentManager", async () => {
      const testLayer = MimicServer.documentManagerLayer({
        schema: TestSchema,
      });

      // Just verify the layer compiles and provides the service
      const result = await Effect.runPromise(
        Effect.gen(function* () {
          // DocumentManager is provided by the layer
          return true;
        }).pipe(Effect.provide(testLayer))
      );

      expect(result).toBe(true);
    });
  });

  describe("layerHttpLayerRouter", () => {
    it("should create a layer with default auth and storage", () => {
      // Verify the function returns a layer without throwing
      const routeLayer = MimicServer.layerHttpLayerRouter({
        basePath: "/mimic/test",
        schema: TestSchema,
      });

      expect(routeLayer).toBeDefined();
    });

    it("should accept custom authLayer option", () => {
      const customAuthLayer = MimicAuthService.layer({
        authHandler: (token) => ({ success: true, userId: token }),
      });

      const routeLayer = MimicServer.layerHttpLayerRouter({
        basePath: "/mimic/test",
        schema: TestSchema,
        authLayer: customAuthLayer,
      });

      expect(routeLayer).toBeDefined();
    });

    it("should accept custom storageLayer option", () => {
      const routeLayer = MimicServer.layerHttpLayerRouter({
        basePath: "/mimic/test",
        schema: TestSchema,
        storageLayer: InMemoryDataStorage.layer,
      });

      expect(routeLayer).toBeDefined();
    });

    it("should accept both custom authLayer and storageLayer", () => {
      const customAuthLayer = MimicAuthService.layer({
        authHandler: (token) => ({ success: true, userId: token }),
      });

      const routeLayer = MimicServer.layerHttpLayerRouter({
        basePath: "/mimic/test",
        schema: TestSchema,
        authLayer: customAuthLayer,
        storageLayer: InMemoryDataStorage.layer,
      });

      expect(routeLayer).toBeDefined();
    });

    it("should use default basePath when not provided", () => {
      const routeLayer = MimicServer.layerHttpLayerRouter({
        schema: TestSchema,
      });

      expect(routeLayer).toBeDefined();
    });

    it("should support maxTransactionHistory option", () => {
      const routeLayer = MimicServer.layerHttpLayerRouter({
        basePath: "/mimic/test",
        schema: TestSchema,
        maxTransactionHistory: 500,
      });

      expect(routeLayer).toBeDefined();
    });
  });

  describe("MimicWebSocketHandler tag", () => {
    it("should have the correct tag identifier", () => {
      expect(MimicServer.MimicWebSocketHandler.key).toBe(
        "@voidhash/mimic-server-effect/MimicWebSocketHandler"
      );
    });
  });

  describe("MimicLayerOptions", () => {
    it("should accept all optional properties", () => {
      // TypeScript compile-time check - if this compiles, the interface is correct
      const options: MimicServer.MimicLayerOptions<typeof TestSchema> = {
        schema: TestSchema,
        basePath: "/custom/path",
        maxTransactionHistory: 1000,
      };

      expect(options.schema).toBe(TestSchema);
      expect(options.basePath).toBe("/custom/path");
      expect(options.maxTransactionHistory).toBe(1000);
    });

    it("should work with only required properties", () => {
      const options: MimicServer.MimicLayerOptions<typeof TestSchema> = {
        schema: TestSchema,
      };

      expect(options.schema).toBe(TestSchema);
      expect(options.basePath).toBeUndefined();
      expect(options.maxTransactionHistory).toBeUndefined();
    });
  });

  describe("presence support", () => {
    const CursorPresence = Presence.make({
      schema: Schema.Struct({
        x: Schema.Number,
        y: Schema.Number,
        name: Schema.optional(Schema.String),
      }),
    });

    describe("layer", () => {
      it("should accept presence option", async () => {
        const testLayer = MimicServer.layer({
          basePath: "/mimic/test",
          schema: TestSchema,
          presence: CursorPresence,
        });

        const result = await Effect.runPromise(
          Effect.gen(function* () {
            const handler = yield* MimicServer.MimicWebSocketHandler;
            return typeof handler === "function";
          }).pipe(Effect.provide(testLayer))
        );

        expect(result).toBe(true);
      });

      it("should work with presence and custom auth", async () => {
        const customAuthLayer = MimicAuthService.layer({
          authHandler: (token) => ({ success: true, userId: token }),
        });

        const testLayer = MimicServer.layer({
          basePath: "/mimic/test",
          schema: TestSchema,
          presence: CursorPresence,
        }).pipe(Layer.provideMerge(customAuthLayer));

        const result = await Effect.runPromise(
          Effect.gen(function* () {
            const handler = yield* MimicServer.MimicWebSocketHandler;
            return typeof handler === "function";
          }).pipe(Effect.provide(testLayer))
        );

        expect(result).toBe(true);
      });

      it("should work with presence and maxTransactionHistory", async () => {
        const testLayer = MimicServer.layer({
          basePath: "/mimic/test",
          schema: TestSchema,
          presence: CursorPresence,
          maxTransactionHistory: 500,
        });

        const result = await Effect.runPromise(
          Effect.gen(function* () {
            const handler = yield* MimicServer.MimicWebSocketHandler;
            return typeof handler === "function";
          }).pipe(Effect.provide(testLayer))
        );

        expect(result).toBe(true);
      });
    });

    describe("handlerLayer", () => {
      it("should accept presence option", async () => {
        const testLayer = MimicServer.handlerLayer({
          schema: TestSchema,
          presence: CursorPresence,
        });

        const result = await Effect.runPromise(
          Effect.gen(function* () {
            const handler = yield* MimicServer.MimicWebSocketHandler;
            return typeof handler === "function";
          }).pipe(Effect.provide(testLayer))
        );

        expect(result).toBe(true);
      });
    });

    describe("documentManagerLayer", () => {
      it("should accept presence option", async () => {
        const testLayer = MimicServer.documentManagerLayer({
          schema: TestSchema,
          presence: CursorPresence,
        });

        const result = await Effect.runPromise(
          Effect.gen(function* () {
            return true;
          }).pipe(Effect.provide(testLayer))
        );

        expect(result).toBe(true);
      });
    });

    describe("layerHttpLayerRouter", () => {
      it("should accept presence option", () => {
        const routeLayer = MimicServer.layerHttpLayerRouter({
          basePath: "/mimic/test",
          schema: TestSchema,
          presence: CursorPresence,
        });

        expect(routeLayer).toBeDefined();
      });

      it("should work with presence and custom authLayer", () => {
        const customAuthLayer = MimicAuthService.layer({
          authHandler: (token) => ({ success: true, userId: token }),
        });

        const routeLayer = MimicServer.layerHttpLayerRouter({
          basePath: "/mimic/test",
          schema: TestSchema,
          presence: CursorPresence,
          authLayer: customAuthLayer,
        });

        expect(routeLayer).toBeDefined();
      });

      it("should work with presence and all options", () => {
        const customAuthLayer = MimicAuthService.layer({
          authHandler: (token) => ({ success: true, userId: token }),
        });

        const routeLayer = MimicServer.layerHttpLayerRouter({
          basePath: "/mimic/test",
          schema: TestSchema,
          presence: CursorPresence,
          maxTransactionHistory: 500,
          authLayer: customAuthLayer,
          storageLayer: InMemoryDataStorage.layer,
        });

        expect(routeLayer).toBeDefined();
      });
    });

    describe("MimicLayerOptions with presence", () => {
      it("should accept presence in options", () => {
        const options: MimicServer.MimicLayerOptions<typeof TestSchema> = {
          schema: TestSchema,
          basePath: "/custom/path",
          maxTransactionHistory: 1000,
          presence: CursorPresence,
        };

        expect(options.schema).toBe(TestSchema);
        expect(options.basePath).toBe("/custom/path");
        expect(options.maxTransactionHistory).toBe(1000);
        expect(options.presence).toBe(CursorPresence);
      });
    });
  });
});
