import { describe, it, expect } from "vitest";
import * as Schema from "effect/Schema";
import * as Presence from "../src/Presence";

// =============================================================================
// Test Schemas
// =============================================================================

const CursorSchema = Schema.Struct({
  x: Schema.Number,
  y: Schema.Number,
});

const UserPresenceSchema = Schema.Struct({
  name: Schema.String,
  status: Schema.Literal("online", "away", "busy"),
  cursor: Schema.optional(CursorSchema),
});

// =============================================================================
// Presence Tests
// =============================================================================

describe("Presence", () => {
  describe("make", () => {
    it("should create a Presence instance with complex schema", () => {
      const presence = Presence.make({
        schema: UserPresenceSchema,
      });

      expect(presence._tag).toBe("Presence");
      expect(presence.schema).toBe(UserPresenceSchema);
    });
  });

  describe("validate", () => {
    it("should return validated data for valid input", () => {
      const presence = Presence.make({
        schema: CursorSchema,
      });

      const result = Presence.validate(presence, { x: 10, y: 20 });

      expect(result).toEqual({ x: 10, y: 20 });
    });

    it("should throw ParseError for invalid input", () => {
      const presence = Presence.make({
        schema: CursorSchema,
      });

      expect(() => Presence.validate(presence, { x: "invalid", y: 20 })).toThrow();
    });

    it("should throw for missing required fields", () => {
      const presence = Presence.make({
        schema: CursorSchema,
      });

      expect(() => Presence.validate(presence, { x: 10 })).toThrow();
    });

    it("should throw for null input", () => {
      const presence = Presence.make({
        schema: CursorSchema,
      });

      expect(() => Presence.validate(presence, null)).toThrow();
    });

    it("should throw for undefined input", () => {
      const presence = Presence.make({
        schema: CursorSchema,
      });

      expect(() => Presence.validate(presence, undefined)).toThrow();
    });

    it("should validate complex schema with optional fields", () => {
      const presence = Presence.make({
        schema: UserPresenceSchema,
      });

      // Without optional cursor
      const result1 = Presence.validate(presence, {
        name: "Alice",
        status: "online",
      });
      expect(result1).toEqual({ name: "Alice", status: "online" });

      // With optional cursor
      const result2 = Presence.validate(presence, {
        name: "Bob",
        status: "away",
        cursor: { x: 100, y: 200 },
      });
      expect(result2).toEqual({
        name: "Bob",
        status: "away",
        cursor: { x: 100, y: 200 },
      });
    });

    it("should throw for invalid literal value", () => {
      const presence = Presence.make({
        schema: UserPresenceSchema,
      });

      expect(() =>
        Presence.validate(presence, {
          name: "Alice",
          status: "invalid-status",
        })
      ).toThrow();
    });
  });

  describe("validateSafe", () => {
    it("should return validated data for valid input", () => {
      const presence = Presence.make({
        schema: CursorSchema,
      });

      const result = Presence.validateSafe(presence, { x: 10, y: 20 });

      expect(result).toEqual({ x: 10, y: 20 });
    });

    it("should return undefined for invalid input", () => {
      const presence = Presence.make({
        schema: CursorSchema,
      });

      const result = Presence.validateSafe(presence, { x: "invalid", y: 20 });

      expect(result).toBeUndefined();
    });

    it("should return undefined for missing required fields", () => {
      const presence = Presence.make({
        schema: CursorSchema,
      });

      const result = Presence.validateSafe(presence, { x: 10 });

      expect(result).toBeUndefined();
    });

    it("should return undefined for null input", () => {
      const presence = Presence.make({
        schema: CursorSchema,
      });

      const result = Presence.validateSafe(presence, null);

      expect(result).toBeUndefined();
    });

    it("should return undefined for undefined input", () => {
      const presence = Presence.make({
        schema: CursorSchema,
      });

      const result = Presence.validateSafe(presence, undefined);

      expect(result).toBeUndefined();
    });

    it("should validate complex schema with optional fields", () => {
      const presence = Presence.make({
        schema: UserPresenceSchema,
      });

      const result = Presence.validateSafe(presence, {
        name: "Alice",
        status: "busy",
        cursor: { x: 50, y: 75 },
      });

      expect(result).toEqual({
        name: "Alice",
        status: "busy",
        cursor: { x: 50, y: 75 },
      });
    });
  });

  describe("isValid", () => {
    it("should return true for valid input", () => {
      const presence = Presence.make({
        schema: CursorSchema,
      });

      expect(Presence.isValid(presence, { x: 10, y: 20 })).toBe(true);
    });

    it("should return false for invalid input", () => {
      const presence = Presence.make({
        schema: CursorSchema,
      });

      expect(Presence.isValid(presence, { x: "invalid", y: 20 })).toBe(false);
    });

    it("should return false for missing required fields", () => {
      const presence = Presence.make({
        schema: CursorSchema,
      });

      expect(Presence.isValid(presence, { x: 10 })).toBe(false);
    });

    it("should return false for null input", () => {
      const presence = Presence.make({
        schema: CursorSchema,
      });

      expect(Presence.isValid(presence, null)).toBe(false);
    });

    it("should return false for undefined input", () => {
      const presence = Presence.make({
        schema: CursorSchema,
      });

      expect(Presence.isValid(presence, undefined)).toBe(false);
    });

    it("should act as type guard", () => {
      const presence = Presence.make({
        schema: CursorSchema,
      });

      const data: unknown = { x: 10, y: 20 };

      if (Presence.isValid(presence, data)) {
        // TypeScript should now know data is { x: number; y: number }
        expect(data.x).toBe(10);
        expect(data.y).toBe(20);
      } else {
        // Should not reach here
        expect.fail("isValid should return true for valid data");
      }
    });

    it("should validate complex schema correctly", () => {
      const presence = Presence.make({
        schema: UserPresenceSchema,
      });

      expect(
        Presence.isValid(presence, {
          name: "Alice",
          status: "online",
        })
      ).toBe(true);

      expect(
        Presence.isValid(presence, {
          name: "Bob",
          status: "invalid",
        })
      ).toBe(false);
    });
  });

  describe("PresenceEntry", () => {
    it("should have correct structure with data only", () => {
      const entry: Presence.PresenceEntry<{ x: number; y: number }> = {
        data: { x: 10, y: 20 },
      };

      expect(entry.data).toEqual({ x: 10, y: 20 });
      expect(entry.userId).toBeUndefined();
    });

    it("should have correct structure with data and userId", () => {
      const entry: Presence.PresenceEntry<{ x: number; y: number }> = {
        data: { x: 10, y: 20 },
        userId: "user-123",
      };

      expect(entry.data).toEqual({ x: 10, y: 20 });
      expect(entry.userId).toBe("user-123");
    });
  });

  describe("type inference", () => {
    it("should correctly infer data type from Presence", () => {
      const presence = Presence.make({
        schema: CursorSchema,
      });

      type InferredType = Presence.Infer<typeof presence>;

      // This is a compile-time check - if it compiles, the type is correct
      const data: InferredType = { x: 10, y: 20 };
      expect(data.x).toBe(10);
      expect(data.y).toBe(20);
    });

    it("should correctly infer complex data type", () => {
      const presence = Presence.make({
        schema: UserPresenceSchema,
      });

      type InferredType = Presence.Infer<typeof presence>;

      const data: InferredType = {
        name: "Alice",
        status: "online",
        cursor: { x: 10, y: 20 },
      };

      expect(data.name).toBe("Alice");
      expect(data.status).toBe("online");
      expect(data.cursor).toEqual({ x: 10, y: 20 });
    });
  });
});

