import { describe, it, expect } from "vitest";
import { Effect, Layer } from "effect";
import { Schema } from "effect";
import { Primitive, Presence } from "@voidhash/mimic";
import { MimicServer } from "../src/MimicServer";
import { MimicServerEngine } from "../src/MimicServerEngine";
import { ColdStorage } from "../src/ColdStorage";
import { HotStorage } from "../src/HotStorage";
import { MimicAuthService } from "../src/MimicAuthService";

// =============================================================================
// Test Schema
// =============================================================================

const TestSchema = Primitive.Struct({
  title: Primitive.String().default(""),
  count: Primitive.Number().default(0),
});

const CursorPresence = Presence.make({
  schema: Schema.Struct({
    x: Schema.Number,
    y: Schema.Number,
    name: Schema.optional(Schema.String),
  }),
});

// =============================================================================
// MimicServer Tests
// =============================================================================

describe("MimicServer", () => {
  describe("layerHttpLayerRouter", () => {
    it("should create route layer with default config", () => {
      const route = MimicServer.layerHttpLayerRouter();
      
      // Should return a Layer
      expect(route).toBeDefined();
      // Layer should have the proper structure
      expect(typeof route).toBe("object");
    });

    it("should create route layer with custom path", () => {
      const route = MimicServer.layerHttpLayerRouter({
        path: "/custom-mimic",
      });
      
      expect(route).toBeDefined();
    });

    it("should create route layer with custom heartbeat config", () => {
      const route = MimicServer.layerHttpLayerRouter({
        path: "/mimic",
        heartbeatInterval: "15 seconds",
        heartbeatTimeout: "5 seconds",
      });
      
      expect(route).toBeDefined();
    });

    it("should compose with engine layer", () => {
      // Create the engine
      const Engine = MimicServerEngine.make({
        schema: TestSchema,
        initial: { title: "Untitled" },
      });

      // Create the route layer
      const MimicRoute = MimicServer.layerHttpLayerRouter({
        path: "/mimic",
      });

      // Wire together - this should type-check
      const MimicLive = MimicRoute.pipe(
        Layer.provide(Engine),
        Layer.provide(ColdStorage.InMemory.make()),
        Layer.provide(HotStorage.InMemory.make()),
        Layer.provide(MimicAuthService.NoAuth.make())
      );

      expect(MimicLive).toBeDefined();
    });

    it("should compose with presence-enabled engine", () => {
      // Create the engine with presence
      const Engine = MimicServerEngine.make({
        schema: TestSchema,
        initial: { title: "Untitled" },
        presence: CursorPresence,
      });

      // Create the route layer
      const MimicRoute = MimicServer.layerHttpLayerRouter({
        path: "/mimic",
      });

      // Wire together
      const MimicLive = MimicRoute.pipe(
        Layer.provide(Engine),
        Layer.provide(ColdStorage.InMemory.make()),
        Layer.provide(HotStorage.InMemory.make()),
        Layer.provide(MimicAuthService.NoAuth.make())
      );

      expect(MimicLive).toBeDefined();
    });

    it("should compose with static auth", () => {
      // Create the engine
      const Engine = MimicServerEngine.make({
        schema: TestSchema,
        initial: { title: "Untitled" },
      });

      // Create the route layer
      const MimicRoute = MimicServer.layerHttpLayerRouter({
        path: "/mimic",
      });

      // Wire together with static auth
      const MimicLive = MimicRoute.pipe(
        Layer.provide(Engine),
        Layer.provide(ColdStorage.InMemory.make()),
        Layer.provide(HotStorage.InMemory.make()),
        Layer.provide(
          MimicAuthService.Static.make({
            permissions: { admin: "write", user: "read" },
            defaultPermission: "read",
          })
        )
      );

      expect(MimicLive).toBeDefined();
    });
  });

  describe("namespace", () => {
    it("should export layerHttpLayerRouter function", () => {
      expect(typeof MimicServer.layerHttpLayerRouter).toBe("function");
    });
  });
});
