import { describe, expect, it } from "@effect/vitest";
import * as Primitive from "../../src/Primitive";
import * as ProxyEnvironment from "../../src/ProxyEnvironment";
import * as OperationPath from "../../src/OperationPath";
import * as Operation from "../../src/Operation";

describe("NumberPrimitive", () => {
  describe("proxy", () => {
    it("set() generates correct operation with path and payload", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => operations.push(op));

      const numberPrimitive = Primitive.Number().required();
      const proxy = numberPrimitive._internal.createProxy(env, OperationPath.make(""));

      proxy.set(42);

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("number.set");
      expect(operations[0]!.payload).toBe(42);
    });

    it("set() works with decimal numbers", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => operations.push(op));

      const numberPrimitive = Primitive.Number();
      const proxy = numberPrimitive._internal.createProxy(env, OperationPath.make(""));

      proxy.set(3.14159);

      expect(operations[0]!.payload).toBe(3.14159);
    });

    it("set() works with negative numbers", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => operations.push(op));

      const numberPrimitive = Primitive.Number();
      const proxy = numberPrimitive._internal.createProxy(env, OperationPath.make(""));

      proxy.set(-100);

      expect(operations[0]!.payload).toBe(-100);
    });
  });

  describe("applyOperation", () => {
    it("returns the new number value from number.set operation", () => {
      const numberPrimitive = Primitive.Number();
      const operation: Operation.Operation<any, any, any> = {
        kind: "number.set",
        path: OperationPath.make(""),
        payload: 123,
      };

      const result = numberPrimitive._internal.applyOperation(undefined, operation);
      expect(result).toBe(123);
    });

    it("replaces existing state with new value", () => {
      const numberPrimitive = Primitive.Number();
      const operation: Operation.Operation<any, any, any> = {
        kind: "number.set",
        path: OperationPath.make(""),
        payload: 999,
      };

      const result = numberPrimitive._internal.applyOperation(100, operation);
      expect(result).toBe(999);
    });

    it("throws ValidationError for non-number payload", () => {
      const numberPrimitive = Primitive.Number();
      const operation: Operation.Operation<any, any, any> = {
        kind: "number.set",
        path: OperationPath.make(""),
        payload: "42",
      };

      expect(() => numberPrimitive._internal.applyOperation(undefined, operation)).toThrow(
        Primitive.ValidationError
      );
    });

    it("throws ValidationError for wrong operation kind", () => {
      const numberPrimitive = Primitive.Number();
      const operation: Operation.Operation<any, any, any> = {
        kind: "string.set",
        path: OperationPath.make(""),
        payload: 42,
      };

      expect(() => numberPrimitive._internal.applyOperation(undefined, operation)).toThrow(
        Primitive.ValidationError
      );
    });
  });

  describe("getInitialState", () => {
    it("returns undefined when no default is set", () => {
      const numberPrimitive = Primitive.Number();
      expect(numberPrimitive._internal.getInitialState()).toBeUndefined();
    });

    it("returns the default value when set", () => {
      const numberPrimitive = Primitive.Number().default(0);
      expect(numberPrimitive._internal.getInitialState()).toBe(0);
    });
  });

  describe("schema modifiers", () => {
    it("required() returns a new NumberPrimitive", () => {
      const original = Primitive.Number();
      const required = original.required();

      expect(required).toBeInstanceOf(Primitive.NumberPrimitive);
      expect(required).not.toBe(original);
    });

    it("default() returns a new NumberPrimitive with default value", () => {
      const original = Primitive.Number();
      const withDefault = original.default(100);

      expect(withDefault).toBeInstanceOf(Primitive.NumberPrimitive);
      expect(withDefault._internal.getInitialState()).toBe(100);
    });
  });
});

// =============================================================================
// Literal Primitive Tests
// =============================================================================
