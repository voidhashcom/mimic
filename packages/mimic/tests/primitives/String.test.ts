import { describe, expect, it } from "@effect/vitest";
import * as Primitive from "../../src/Primitive";
import * as ProxyEnvironment from "../../src/ProxyEnvironment";
import * as OperationPath from "../../src/OperationPath";
import * as Operation from "../../src/Operation";

describe("StringPrimitive", () => {
  describe("proxy", () => {
    it("set() generates correct operation with path and payload", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => {
        operations.push(op);
      });

      const stringPrimitive = Primitive.String().required();
      const proxy = stringPrimitive._internal.createProxy(env, OperationPath.make(""));

      proxy.set("Hello World");

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("string.set");
      expect(operations[0]!.payload).toBe("Hello World");
    });

    it("set() includes the correct path in operation", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => {
        operations.push(op);
      });

      const stringPrimitive = Primitive.String();
      const proxy = stringPrimitive._internal.createProxy(env, OperationPath.make("users/0/name"));

      proxy.set("John");

      expect(operations).toHaveLength(1);
      expect(operations[0]!.path.toTokens()).toEqual(["users", "0", "name"]);
    });
  });

  describe("applyOperation", () => {
    it("returns the new string value from string.set operation", () => {
      const stringPrimitive = Primitive.String();
      const operation: Operation.Operation<any, any, any> = {
        kind: "string.set",
        path: OperationPath.make(""),
        payload: "New Value",
      };

      const result = stringPrimitive._internal.applyOperation(undefined, operation);

      expect(result).toBe("New Value");
    });

    it("replaces existing state with new value", () => {
      const stringPrimitive = Primitive.String();
      const operation: Operation.Operation<any, any, any> = {
        kind: "string.set",
        path: OperationPath.make(""),
        payload: "Updated",
      };

      const result = stringPrimitive._internal.applyOperation("Original", operation);

      expect(result).toBe("Updated");
    });

    it("throws ValidationError for non-string payload", () => {
      const stringPrimitive = Primitive.String();
      const operation: Operation.Operation<any, any, any> = {
        kind: "string.set",
        path: OperationPath.make(""),
        payload: 123,
      };

      expect(() => stringPrimitive._internal.applyOperation(undefined, operation)).toThrow(
        Primitive.ValidationError
      );
    });

    it("throws ValidationError for wrong operation kind", () => {
      const stringPrimitive = Primitive.String();
      const operation: Operation.Operation<any, any, any> = {
        kind: "wrong.kind",
        path: OperationPath.make(""),
        payload: "value",
      };

      expect(() => stringPrimitive._internal.applyOperation(undefined, operation)).toThrow(
        Primitive.ValidationError
      );
    });
  });

  describe("getInitialState", () => {
    it("returns undefined when no default is set", () => {
      const stringPrimitive = Primitive.String();
      expect(stringPrimitive._internal.getInitialState()).toBeUndefined();
    });

    it("returns the default value when set", () => {
      const stringPrimitive = Primitive.String().default("Default Text");
      expect(stringPrimitive._internal.getInitialState()).toBe("Default Text");
    });
  });

  describe("schema modifiers", () => {
    it("required() returns a new StringPrimitive", () => {
      const original = Primitive.String();
      const required = original.required();

      expect(required).toBeInstanceOf(Primitive.StringPrimitive);
      expect(required).not.toBe(original);
    });

    it("default() returns a new StringPrimitive with default value", () => {
      const original = Primitive.String();
      const withDefault = original.default("test");

      expect(withDefault).toBeInstanceOf(Primitive.StringPrimitive);
      expect(withDefault._internal.getInitialState()).toBe("test");
    });
  });
});

// =============================================================================
// Boolean Primitive Tests
// =============================================================================
