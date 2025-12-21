import { describe, expect, it } from "@effect/vitest";
import * as Primitive from "../../src/Primitive";
import * as ProxyEnvironment from "../../src/ProxyEnvironment";
import * as OperationPath from "../../src/OperationPath";
import * as Operation from "../../src/Operation";

describe("LiteralPrimitive", () => {
  describe("proxy", () => {
    it("set() generates correct operation with string literal", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => operations.push(op));

      const literalPrimitive = Primitive.Literal("active" as const);
      const proxy = literalPrimitive._internal.createProxy(env, OperationPath.make(""));

      proxy.set("active");

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("literal.set");
      expect(operations[0]!.payload).toBe("active");
    });

    it("set() generates correct operation with number literal", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => operations.push(op));

      const literalPrimitive = Primitive.Literal(42 as const);
      const proxy = literalPrimitive._internal.createProxy(env, OperationPath.make(""));

      proxy.set(42);

      expect(operations[0]!.payload).toBe(42);
    });

    it("set() generates correct operation with boolean literal", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => operations.push(op));

      const literalPrimitive = Primitive.Literal(true as const);
      const proxy = literalPrimitive._internal.createProxy(env, OperationPath.make(""));

      proxy.set(true);

      expect(operations[0]!.payload).toBe(true);
    });

    it("set() generates correct operation with null literal", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => operations.push(op));

      const literalPrimitive = Primitive.Literal(null);
      const proxy = literalPrimitive._internal.createProxy(env, OperationPath.make(""));

      proxy.set(null);

      expect(operations[0]!.payload).toBe(null);
    });
  });

  describe("applyOperation", () => {
    it("returns the literal value from literal.set operation", () => {
      const literalPrimitive = Primitive.Literal("foo" as const);
      const operation: Operation.Operation<any, any, any> = {
        kind: "literal.set",
        path: OperationPath.make(""),
        payload: "foo",
      };

      const result = literalPrimitive._internal.applyOperation(undefined, operation);
      expect(result).toBe("foo");
    });

    it("throws ValidationError for wrong literal value", () => {
      const literalPrimitive = Primitive.Literal("foo" as const);
      const operation: Operation.Operation<any, any, any> = {
        kind: "literal.set",
        path: OperationPath.make(""),
        payload: "bar",
      };

      expect(() => literalPrimitive._internal.applyOperation(undefined, operation)).toThrow(
        Primitive.ValidationError
      );
    });

    it("throws ValidationError for wrong operation kind", () => {
      const literalPrimitive = Primitive.Literal("foo" as const);
      const operation: Operation.Operation<any, any, any> = {
        kind: "string.set",
        path: OperationPath.make(""),
        payload: "foo",
      };

      expect(() => literalPrimitive._internal.applyOperation(undefined, operation)).toThrow(
        Primitive.ValidationError
      );
    });
  });

  describe("getInitialState", () => {
    it("returns undefined when no default is set", () => {
      const literalPrimitive = Primitive.Literal("test" as const);
      expect(literalPrimitive._internal.getInitialState()).toBeUndefined();
    });

    it("returns the default value when set", () => {
      const literalPrimitive = Primitive.Literal("active" as const).default("active");
      expect(literalPrimitive._internal.getInitialState()).toBe("active");
    });
  });

  describe("literal accessor", () => {
    it("returns the literal value", () => {
      const literalPrimitive = Primitive.Literal("myLiteral" as const);
      expect(literalPrimitive.literal).toBe("myLiteral");
    });
  });
});

// =============================================================================
// Struct Primitive Tests
// =============================================================================
