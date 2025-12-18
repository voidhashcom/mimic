import { describe, it, expect } from "vitest";
import * as Duration from "effect/Duration";
import { Primitive } from "@voidhash/mimic";
import * as MimicConfig from "../src/MimicConfig";

// =============================================================================
// Test Schema
// =============================================================================

const TestSchema = Primitive.Struct({
  title: Primitive.String().default(""),
  count: Primitive.Number().default(0),
});

// =============================================================================
// MimicConfig Tests
// =============================================================================

describe("MimicConfig", () => {
  describe("makeSchemaRegistry", () => {
    it("should create a registry from a record of schemas", () => {
      const registry = MimicConfig.makeSchemaRegistry({
        todo: TestSchema,
        notes: TestSchema,
      });

      expect(registry.get("todo")).toBe(TestSchema);
      expect(registry.get("notes")).toBe(TestSchema);
      expect(registry.get("unknown")).toBeUndefined();
    });

    it("should list all types", () => {
      const registry = MimicConfig.makeSchemaRegistry({
        todo: TestSchema,
        notes: TestSchema,
      });

      const types = registry.types();
      expect(types).toContain("todo");
      expect(types).toContain("notes");
      expect(types).toHaveLength(2);
    });
  });

  describe("make", () => {
    it("should create config with default values", () => {
      const config = MimicConfig.make({
        schemas: { default: TestSchema },
      });

      expect(config.persistenceMode).toEqual({ type: "in-memory" });
      expect(Duration.toMillis(config.maxIdleTime)).toBe(5 * 60 * 1000); // 5 minutes
      expect(config.maxTransactionHistory).toBe(1000);
      expect(Duration.toMillis(config.heartbeatInterval)).toBe(30 * 1000);
      expect(Duration.toMillis(config.heartbeatTimeout)).toBe(10 * 1000);
      expect(config.authHandler).toBeUndefined();
    });

    it("should accept custom values", () => {
      const authHandler: MimicConfig.AuthHandler = (token) => ({
        success: true,
        userId: token,
      });

      const config = MimicConfig.make({
        schemas: { default: TestSchema },
        authHandler,
        persistenceMode: { type: "persistent" },
        maxIdleTime: "10 minutes",
        maxTransactionHistory: 500,
        heartbeatInterval: "1 minute",
        heartbeatTimeout: "30 seconds",
      });

      expect(config.persistenceMode).toEqual({ type: "persistent" });
      expect(Duration.toMillis(config.maxIdleTime)).toBe(10 * 60 * 1000);
      expect(config.maxTransactionHistory).toBe(500);
      expect(Duration.toMillis(config.heartbeatInterval)).toBe(60 * 1000);
      expect(Duration.toMillis(config.heartbeatTimeout)).toBe(30 * 1000);
      expect(config.authHandler).toBe(authHandler);
    });

    it("should accept a SchemaRegistry directly", () => {
      const registry = MimicConfig.makeSchemaRegistry({
        todo: TestSchema,
      });

      const config = MimicConfig.make({
        schemas: registry,
      });

      expect(config.schemaRegistry.get("todo")).toBe(TestSchema);
    });
  });
});
