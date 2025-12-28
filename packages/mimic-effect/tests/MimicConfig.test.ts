import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import * as Duration from "effect/Duration";
import * as Schema from "effect/Schema";
import { Primitive, Presence } from "@voidhash/mimic";
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
  describe("make", () => {
    it("should create config with default values", () => {
      const config = MimicConfig.make({
        schema: TestSchema,
      });

      expect(config.schema).toBe(TestSchema);
      expect(Duration.toMillis(config.maxIdleTime)).toBe(5 * 60 * 1000); // 5 minutes
      expect(config.maxTransactionHistory).toBe(1000);
      expect(Duration.toMillis(config.heartbeatInterval)).toBe(30 * 1000); // 30 seconds
      expect(Duration.toMillis(config.heartbeatTimeout)).toBe(10 * 1000); // 10 seconds
    });

    it("should accept custom maxIdleTime", () => {
      const config = MimicConfig.make({
        schema: TestSchema,
        maxIdleTime: "10 minutes",
      });

      expect(Duration.toMillis(config.maxIdleTime)).toBe(10 * 60 * 1000);
    });

    it("should accept custom maxTransactionHistory", () => {
      const config = MimicConfig.make({
        schema: TestSchema,
        maxTransactionHistory: 500,
      });

      expect(config.maxTransactionHistory).toBe(500);
    });

    it("should accept custom heartbeatInterval", () => {
      const config = MimicConfig.make({
        schema: TestSchema,
        heartbeatInterval: "1 minute",
      });

      expect(Duration.toMillis(config.heartbeatInterval)).toBe(60 * 1000);
    });

    it("should accept custom heartbeatTimeout", () => {
      const config = MimicConfig.make({
        schema: TestSchema,
        heartbeatTimeout: "30 seconds",
      });

      expect(Duration.toMillis(config.heartbeatTimeout)).toBe(30 * 1000);
    });

    it("should accept all custom values", () => {
      const config = MimicConfig.make({
        schema: TestSchema,
        maxIdleTime: "15 minutes",
        maxTransactionHistory: 2000,
        heartbeatInterval: "45 seconds",
        heartbeatTimeout: "15 seconds",
      });

      expect(config.schema).toBe(TestSchema);
      expect(Duration.toMillis(config.maxIdleTime)).toBe(15 * 60 * 1000);
      expect(config.maxTransactionHistory).toBe(2000);
      expect(Duration.toMillis(config.heartbeatInterval)).toBe(45 * 1000);
      expect(Duration.toMillis(config.heartbeatTimeout)).toBe(15 * 1000);
    });
  });

  describe("layer", () => {
    it("should create a layer that provides MimicServerConfigTag", async () => {
      const testLayer = MimicConfig.layer({
        schema: TestSchema,
        maxTransactionHistory: 100,
      });

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const config = yield* MimicConfig.MimicServerConfigTag;
          return config;
        }).pipe(Effect.provide(testLayer))
      );

      expect(result.schema).toBe(TestSchema);
      expect(result.maxTransactionHistory).toBe(100);
    });
  });

  describe("MimicServerConfigTag", () => {
    it("should have the correct tag identifier", () => {
      expect(MimicConfig.MimicServerConfigTag.key).toBe(
        "@voidhash/mimic-server-effect/MimicServerConfig"
      );
    });
  });

  describe("presence configuration", () => {
    const CursorPresence = Presence.make({
      schema: Schema.Struct({
        x: Schema.Number,
        y: Schema.Number,
        name: Schema.optional(Schema.String),
      }),
    });

    it("should have undefined presence by default", () => {
      const config = MimicConfig.make({
        schema: TestSchema,
      });

      expect(config.presence).toBeUndefined();
    });

    it("should accept presence schema option", () => {
      const config = MimicConfig.make({
        schema: TestSchema,
        presence: CursorPresence,
      });

      expect(config.presence).toBe(CursorPresence);
    });

    it("should provide presence through layer", async () => {
      const testLayer = MimicConfig.layer({
        schema: TestSchema,
        presence: CursorPresence,
      });

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const config = yield* MimicConfig.MimicServerConfigTag;
          return config.presence;
        }).pipe(Effect.provide(testLayer))
      );

      expect(result).toBe(CursorPresence);
    });

    it("should work with all options including presence", () => {
      const config = MimicConfig.make({
        schema: TestSchema,
        maxIdleTime: "10 minutes",
        maxTransactionHistory: 500,
        heartbeatInterval: "1 minute",
        heartbeatTimeout: "20 seconds",
        presence: CursorPresence,
      });

      expect(config.schema).toBe(TestSchema);
      expect(Duration.toMillis(config.maxIdleTime)).toBe(10 * 60 * 1000);
      expect(config.maxTransactionHistory).toBe(500);
      expect(Duration.toMillis(config.heartbeatInterval)).toBe(60 * 1000);
      expect(Duration.toMillis(config.heartbeatTimeout)).toBe(20 * 1000);
      expect(config.presence).toBe(CursorPresence);
    });
  });

  describe("initial state configuration", () => {
    it("should have undefined initial state by default", () => {
      const config = MimicConfig.make({
        schema: TestSchema,
      });

      expect(config.initial).toBeUndefined();
    });

    it("should accept initial state option", () => {
      const config = MimicConfig.make({
        schema: TestSchema,
        initial: { title: "My Document", count: 42 },
      });

      expect(config.initial).toEqual({ title: "My Document", count: 42 });
    });

    it("should apply defaults for omitted fields in initial state", () => {
      const config = MimicConfig.make({
        schema: TestSchema,
        initial: { title: "My Document" }, // count has default of 0
      });

      expect(config.initial).toEqual({ title: "My Document", count: 0 });
    });

    it("should provide initial state through layer", async () => {
      const testLayer = MimicConfig.layer({
        schema: TestSchema,
        initial: { title: "From Layer", count: 100 },
      });

      const result = await Effect.runPromise(
        Effect.gen(function* () {
          const config = yield* MimicConfig.MimicServerConfigTag;
          return config.initial;
        }).pipe(Effect.provide(testLayer))
      );

      expect(result).toEqual({ title: "From Layer", count: 100 });
    });

    it("should work with schema that has required fields without defaults", () => {
      const SchemaWithRequired = Primitive.Struct({
        name: Primitive.String().required(),
        optional: Primitive.String().default("default"),
      });

      const config = MimicConfig.make({
        schema: SchemaWithRequired,
        initial: { name: "Required Name" },
      });

      expect(config.initial).toEqual({ name: "Required Name", optional: "default" });
    });

    it("should work with all options including initial", () => {
      const config = MimicConfig.make({
        schema: TestSchema,
        maxIdleTime: "10 minutes",
        maxTransactionHistory: 500,
        initial: { title: "Full Options", count: 999 },
      });

      expect(config.schema).toBe(TestSchema);
      expect(Duration.toMillis(config.maxIdleTime)).toBe(10 * 60 * 1000);
      expect(config.maxTransactionHistory).toBe(500);
      expect(config.initial).toEqual({ title: "Full Options", count: 999 });
    });
  });
});
