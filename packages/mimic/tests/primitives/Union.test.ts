import { describe, expect, it } from "@effect/vitest";
import * as Primitive from "../../src/Primitive";
import * as ProxyEnvironment from "../../src/ProxyEnvironment";
import * as OperationPath from "../../src/OperationPath";
import * as Operation from "../../src/Operation";

describe("UnionPrimitive", () => {
  const TextVariant = Primitive.Struct({
    type: Primitive.Literal("text" as const),
    content: Primitive.String(),
  });

  const NumberVariant = Primitive.Struct({
    type: Primitive.Literal("number" as const),
    value: Primitive.Number(),
  });

  const unionPrimitive = Primitive.Union({
    variants: {
      text: TextVariant,
      number: NumberVariant,
    },
  });

  describe("proxy", () => {
    it("set() generates correct operation", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => operations.push(op));

      const proxy = unionPrimitive._internal.createProxy(env, OperationPath.make(""));

      proxy.set({ type: "text", content: "Hello" });

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("union.set");
      expect(operations[0]!.payload).toEqual({ type: "text", content: "Hello" });
    });

    it("as() returns variant proxy", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => operations.push(op));

      const proxy = unionPrimitive._internal.createProxy(env, OperationPath.make(""));

      proxy.as("text").content.set("Updated content");

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("string.set");
      expect(operations[0]!.path.toTokens()).toEqual(["content"]);
    });

    it("as() with different variant", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => operations.push(op));

      const proxy = unionPrimitive._internal.createProxy(env, OperationPath.make(""));

      proxy.as("number").value.set(42);

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("number.set");
      expect(operations[0]!.payload).toBe(42);
    });

    it("as() throws for unknown variant", () => {
      const env = ProxyEnvironment.make(() => {});
      const proxy = unionPrimitive._internal.createProxy(env, OperationPath.make(""));

      expect(() => proxy.as("unknown" as any)).toThrow(Primitive.ValidationError);
    });
  });

  describe("applyOperation", () => {
    it("union.set replaces entire value", () => {
      const operation: Operation.Operation<any, any, any> = {
        kind: "union.set",
        path: OperationPath.make(""),
        payload: { type: "text", content: "New text" },
      };

      const result = unionPrimitive._internal.applyOperation(undefined, operation);
      expect(result).toEqual({ type: "text", content: "New text" });
    });

    it("union.set can change variant type", () => {
      const operation: Operation.Operation<any, any, any> = {
        kind: "union.set",
        path: OperationPath.make(""),
        payload: { type: "number", value: 100 },
      };

      const currentState = { type: "text" as const, content: "old" };
      const result = unionPrimitive._internal.applyOperation(currentState, operation);
      expect(result).toEqual({ type: "number", value: 100 });
    });

    it("delegates field operations to active variant", () => {
      const operation: Operation.Operation<any, any, any> = {
        kind: "string.set",
        path: OperationPath.make("content"),
        payload: "Updated",
      };

      const currentState = { type: "text" as const, content: "Original" };
      const result = unionPrimitive._internal.applyOperation(currentState, operation);
      expect(result).toEqual({ type: "text", content: "Updated" });
    });

    it("throws ValidationError for non-object payload on set", () => {
      const operation: Operation.Operation<any, any, any> = {
        kind: "union.set",
        path: OperationPath.make(""),
        payload: "not an object",
      };

      expect(() => unionPrimitive._internal.applyOperation(undefined, operation)).toThrow(
        Primitive.ValidationError
      );
    });

    it("throws ValidationError for missing discriminator", () => {
      const operation: Operation.Operation<any, any, any> = {
        kind: "union.set",
        path: OperationPath.make(""),
        payload: { content: "no type field" },
      };

      expect(() => unionPrimitive._internal.applyOperation(undefined, operation)).toThrow(
        Primitive.ValidationError
      );
    });

    it("throws ValidationError for nested operation on undefined state", () => {
      const operation: Operation.Operation<any, any, any> = {
        kind: "string.set",
        path: OperationPath.make("content"),
        payload: "value",
      };

      expect(() => unionPrimitive._internal.applyOperation(undefined, operation)).toThrow(
        Primitive.ValidationError
      );
    });
  });

  describe("getInitialState", () => {
    it("returns undefined when no default is set", () => {
      expect(unionPrimitive._internal.getInitialState()).toBeUndefined();
    });

    it("returns the default value when set", () => {
      const withDefault = unionPrimitive.default({ type: "text", content: "default" });
      expect(withDefault._internal.getInitialState()).toEqual({
        type: "text",
        content: "default",
      });
    });
  });

  describe("custom discriminator", () => {
    it("supports custom discriminator field", () => {
      const KindVariantA = Primitive.Struct({
        kind: Primitive.Literal("a" as const),
        data: Primitive.String(),
      });

      const KindVariantB = Primitive.Struct({
        kind: Primitive.Literal("b" as const),
        count: Primitive.Number(),
      });

      const customUnion = Primitive.Union({
        discriminator: "kind",
        variants: {
          a: KindVariantA,
          b: KindVariantB,
        },
      });

      expect(customUnion.discriminator).toBe("kind");

      const operation: Operation.Operation<any, any, any> = {
        kind: "string.set",
        path: OperationPath.make("data"),
        payload: "Updated data",
      };

      const currentState = { kind: "a" as const, data: "original" };
      const result = customUnion._internal.applyOperation(currentState, operation);
      expect(result).toEqual({ kind: "a", data: "Updated data" });
    });
  });

  describe("type inference", () => {
    it("infers correct state type from union definition", () => {
      type ExpectedState = Primitive.InferState<typeof unionPrimitive>;

      // This is a compile-time check
      const textState: ExpectedState = { type: "text", content: "hello" };
      const numberState: ExpectedState = { type: "number", value: 42 };

      expect(textState.type).toBe("text");
      expect(numberState.type).toBe("number");
    });
  });
});

// =============================================================================
// Integration Tests - Complex Nested Structures
// =============================================================================
