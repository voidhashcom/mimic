import { describe, expect, it } from "@effect/vitest";
import * as Primitive from "../../src/Primitive";
import * as ProxyEnvironment from "../../src/ProxyEnvironment";
import * as OperationPath from "../../src/OperationPath";
import * as Operation from "../../src/Operation";

describe("BooleanPrimitive", () => {
  describe("proxy", () => {
    it("set() generates correct operation with path and payload", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => operations.push(op));

      const booleanPrimitive = Primitive.Boolean().required();
      const proxy = booleanPrimitive._internal.createProxy(env, OperationPath.make(""));

      proxy.set(true);

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("boolean.set");
      expect(operations[0]!.payload).toBe(true);
    });

    it("set() includes the correct path in operation", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => operations.push(op));

      const booleanPrimitive = Primitive.Boolean();
      const proxy = booleanPrimitive._internal.createProxy(env, OperationPath.make("visible"));

      proxy.set(false);

      expect(operations[0]!.path.toTokens()).toEqual(["visible"]);
    });
  });

  describe("applyOperation", () => {
    it("returns the new boolean value from boolean.set operation", () => {
      const booleanPrimitive = Primitive.Boolean();
      const operation: Operation.Operation<any, any, any> = {
        kind: "boolean.set",
        path: OperationPath.make(""),
        payload: true,
      };

      const result = booleanPrimitive._internal.applyOperation(undefined, operation);
      expect(result).toBe(true);
    });

    it("replaces existing state with new value", () => {
      const booleanPrimitive = Primitive.Boolean();
      const operation: Operation.Operation<any, any, any> = {
        kind: "boolean.set",
        path: OperationPath.make(""),
        payload: false,
      };

      const result = booleanPrimitive._internal.applyOperation(true, operation);
      expect(result).toBe(false);
    });

    it("throws ValidationError for non-boolean payload", () => {
      const booleanPrimitive = Primitive.Boolean();
      const operation: Operation.Operation<any, any, any> = {
        kind: "boolean.set",
        path: OperationPath.make(""),
        payload: "true",
      };

      expect(() => booleanPrimitive._internal.applyOperation(undefined, operation)).toThrow(
        Primitive.ValidationError
      );
    });

    it("throws ValidationError for wrong operation kind", () => {
      const booleanPrimitive = Primitive.Boolean();
      const operation: Operation.Operation<any, any, any> = {
        kind: "string.set",
        path: OperationPath.make(""),
        payload: true,
      };

      expect(() => booleanPrimitive._internal.applyOperation(undefined, operation)).toThrow(
        Primitive.ValidationError
      );
    });
  });

  describe("getInitialState", () => {
    it("returns undefined when no default is set", () => {
      const booleanPrimitive = Primitive.Boolean();
      expect(booleanPrimitive._internal.getInitialState()).toBeUndefined();
    });

    it("returns the default value when set", () => {
      const booleanPrimitive = Primitive.Boolean().default(true);
      expect(booleanPrimitive._internal.getInitialState()).toBe(true);
    });

    it("returns false as default when explicitly set", () => {
      const booleanPrimitive = Primitive.Boolean().default(false);
      expect(booleanPrimitive._internal.getInitialState()).toBe(false);
    });
  });

  describe("schema modifiers", () => {
    it("required() returns a new BooleanPrimitive", () => {
      const original = Primitive.Boolean();
      const required = original.required();

      expect(required).toBeInstanceOf(Primitive.BooleanPrimitive);
      expect(required).not.toBe(original);
    });

    it("default() returns a new BooleanPrimitive with default value", () => {
      const original = Primitive.Boolean();
      const withDefault = original.default(true);

      expect(withDefault).toBeInstanceOf(Primitive.BooleanPrimitive);
      expect(withDefault._internal.getInitialState()).toBe(true);
    });
  });
});

// =============================================================================
// Number Primitive Tests
// =============================================================================
