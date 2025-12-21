import { describe, expect, it } from "@effect/vitest";
import * as Primitive from "../../src/Primitive";
import * as ProxyEnvironment from "../../src/ProxyEnvironment";
import * as OperationPath from "../../src/OperationPath";
import * as Operation from "../../src/Operation";

describe("EitherPrimitive", () => {
  describe("proxy", () => {
    describe("set()", () => {
      it("generates correct operation with string payload", () => {
        const operations: Operation.Operation<any, any, any>[] = [];
        const env = ProxyEnvironment.make((op) => operations.push(op));

        const either = Primitive.Either(Primitive.String(), Primitive.Number());
        const proxy = either._internal.createProxy(env, OperationPath.make(""));

        proxy.set("hello");

        expect(operations).toHaveLength(1);
        expect(operations[0]!.kind).toBe("either.set");
        expect(operations[0]!.payload).toBe("hello");
      });

      it("generates correct operation with number payload", () => {
        const operations: Operation.Operation<any, any, any>[] = [];
        const env = ProxyEnvironment.make((op) => operations.push(op));

        const either = Primitive.Either(Primitive.String(), Primitive.Number());
        const proxy = either._internal.createProxy(env, OperationPath.make(""));

        proxy.set(42);

        expect(operations).toHaveLength(1);
        expect(operations[0]!.kind).toBe("either.set");
        expect(operations[0]!.payload).toBe(42);
      });

      it("generates correct operation with boolean payload", () => {
        const operations: Operation.Operation<any, any, any>[] = [];
        const env = ProxyEnvironment.make((op) => operations.push(op));

        const either = Primitive.Either(Primitive.String(), Primitive.Boolean());
        const proxy = either._internal.createProxy(env, OperationPath.make(""));

        proxy.set(true);

        expect(operations).toHaveLength(1);
        expect(operations[0]!.kind).toBe("either.set");
        expect(operations[0]!.payload).toBe(true);
      });

      it("includes the correct path in operation", () => {
        const operations: Operation.Operation<any, any, any>[] = [];
        const env = ProxyEnvironment.make((op) => operations.push(op));

        const either = Primitive.Either(Primitive.String(), Primitive.Number());
        const proxy = either._internal.createProxy(env, OperationPath.make("status"));

        proxy.set("active");

        expect(operations[0]!.path.toTokens()).toEqual(["status"]);
      });
    });

    describe("get()", () => {
      it("returns undefined when no value is set and no default", () => {
        const env = ProxyEnvironment.make(() => {});

        const either = Primitive.Either(Primitive.String(), Primitive.Number());
        const proxy = either._internal.createProxy(env, OperationPath.make(""));

        expect(proxy.get()).toBeUndefined();
      });

      it("returns default value when no state is set", () => {
        const env = ProxyEnvironment.make(() => {});

        const either = Primitive.Either(Primitive.String(), Primitive.Number()).default("pending");
        const proxy = either._internal.createProxy(env, OperationPath.make(""));

        expect(proxy.get()).toBe("pending");
      });
    });

    describe("toSnapshot()", () => {
      it("returns undefined when no value is set and no default", () => {
        const env = ProxyEnvironment.make(() => {});

        const either = Primitive.Either(Primitive.String(), Primitive.Number());
        const proxy = either._internal.createProxy(env, OperationPath.make(""));

        expect(proxy.toSnapshot()).toBeUndefined();
      });

      it("returns default value when no state is set", () => {
        const env = ProxyEnvironment.make(() => {});

        const either = Primitive.Either(Primitive.String(), Primitive.Number()).default(100);
        const proxy = either._internal.createProxy(env, OperationPath.make(""));

        expect(proxy.toSnapshot()).toBe(100);
      });
    });

    describe("match()", () => {
      it("returns undefined when value is undefined", () => {
        const env = ProxyEnvironment.make(() => {});

        const either = Primitive.Either(Primitive.String(), Primitive.Number());
        const proxy = either._internal.createProxy(env, OperationPath.make(""));

        const result = proxy.match({
          string: (s) => `string: ${s}`,
          number: (n) => `number: ${n}`,
        });

        expect(result).toBeUndefined();
      });

      it("routes to string handler when value is a string", () => {
        const state: Record<string, unknown> = { value: "hello" };
        const env = ProxyEnvironment.make({
          onOperation: () => {},
          getState: (path) => {
            const tokens = path.toTokens().filter((t) => t !== "");
            if (tokens.length === 0) return undefined;
            return state[tokens[0]!];
          },
        });

        const either = Primitive.Either(Primitive.String(), Primitive.Number());
        const proxy = either._internal.createProxy(env, OperationPath.make("value"));

        const result = proxy.match({
          string: (s) => `string: ${s}`,
          number: (n) => `number: ${n}`,
        });

        expect(result).toBe("string: hello");
      });

      it("routes to number handler when value is a number", () => {
        const state: Record<string, unknown> = { value: 42 };
        const env = ProxyEnvironment.make({
          onOperation: () => {},
          getState: (path) => {
            const tokens = path.toTokens().filter((t) => t !== "");
            if (tokens.length === 0) return undefined;
            return state[tokens[0]!];
          },
        });

        const either = Primitive.Either(Primitive.String(), Primitive.Number());
        const proxy = either._internal.createProxy(env, OperationPath.make("value"));

        const result = proxy.match({
          string: (s) => `string: ${s}`,
          number: (n) => `number: ${n}`,
        });

        expect(result).toBe("number: 42");
      });

      it("routes to boolean handler when value is a boolean", () => {
        const state: Record<string, unknown> = { value: true };
        const env = ProxyEnvironment.make({
          onOperation: () => {},
          getState: (path) => {
            const tokens = path.toTokens().filter((t) => t !== "");
            if (tokens.length === 0) return undefined;
            return state[tokens[0]!];
          },
        });

        const either = Primitive.Either(Primitive.String(), Primitive.Boolean());
        const proxy = either._internal.createProxy(env, OperationPath.make("value"));

        const result = proxy.match({
          string: (s) => `string: ${s}`,
          boolean: (b) => `boolean: ${b}`,
        });

        expect(result).toBe("boolean: true");
      });

      it("routes to literal handler when value matches a literal", () => {
        const state: Record<string, unknown> = { value: "auto" };
        const env = ProxyEnvironment.make({
          onOperation: () => {},
          getState: (path) => {
            const tokens = path.toTokens().filter((t) => t !== "");
            if (tokens.length === 0) return undefined;
            return state[tokens[0]!];
          },
        });

        const either = Primitive.Either(Primitive.Literal("auto"), Primitive.Literal("manual"));
        const proxy = either._internal.createProxy(env, OperationPath.make("value"));

        const result = proxy.match({
          literal: (v) => `literal: ${v}`,
        });

        expect(result).toBe("literal: auto");
      });

      it("uses default value when state is undefined", () => {
        const env = ProxyEnvironment.make(() => {});

        const either = Primitive.Either(Primitive.String(), Primitive.Number()).default("default");
        const proxy = either._internal.createProxy(env, OperationPath.make(""));

        const result = proxy.match({
          string: (s) => `string: ${s}`,
          number: (n) => `number: ${n}`,
        });

        expect(result).toBe("string: default");
      });

      it("returns undefined when no handler matches", () => {
        const state: Record<string, unknown> = { value: "hello" };
        const env = ProxyEnvironment.make({
          onOperation: () => {},
          getState: (path) => {
            const tokens = path.toTokens().filter((t) => t !== "");
            if (tokens.length === 0) return undefined;
            return state[tokens[0]!];
          },
        });

        const either = Primitive.Either(Primitive.String(), Primitive.Number());
        const proxy = either._internal.createProxy(env, OperationPath.make("value"));

        const result = proxy.match({
          number: (n) => `number: ${n}`,
        });

        expect(result).toBeUndefined();
      });
    });
  });

  describe("applyOperation", () => {
    it("accepts string payload when String is a variant", () => {
      const either = Primitive.Either(Primitive.String(), Primitive.Number());
      const operation: Operation.Operation<any, any, any> = {
        kind: "either.set",
        path: OperationPath.make(""),
        payload: "hello",
      };

      const result = either._internal.applyOperation(undefined, operation);
      expect(result).toBe("hello");
    });

    it("accepts number payload when Number is a variant", () => {
      const either = Primitive.Either(Primitive.String(), Primitive.Number());
      const operation: Operation.Operation<any, any, any> = {
        kind: "either.set",
        path: OperationPath.make(""),
        payload: 42,
      };

      const result = either._internal.applyOperation(undefined, operation);
      expect(result).toBe(42);
    });

    it("accepts boolean payload when Boolean is a variant", () => {
      const either = Primitive.Either(Primitive.String(), Primitive.Boolean());
      const operation: Operation.Operation<any, any, any> = {
        kind: "either.set",
        path: OperationPath.make(""),
        payload: true,
      };

      const result = either._internal.applyOperation(undefined, operation);
      expect(result).toBe(true);
    });

    it("accepts literal payload when Literal is a variant", () => {
      const either = Primitive.Either(Primitive.Literal("auto"), Primitive.Literal("manual"));
      const operation: Operation.Operation<any, any, any> = {
        kind: "either.set",
        path: OperationPath.make(""),
        payload: "auto",
      };

      const result = either._internal.applyOperation(undefined, operation);
      expect(result).toBe("auto");
    });

    it("replaces existing state with new value", () => {
      const either = Primitive.Either(Primitive.String(), Primitive.Number());
      const operation: Operation.Operation<any, any, any> = {
        kind: "either.set",
        path: OperationPath.make(""),
        payload: 100,
      };

      const result = either._internal.applyOperation("old value", operation);
      expect(result).toBe(100);
    });

    it("throws ValidationError for payload not matching any variant", () => {
      const either = Primitive.Either(Primitive.String(), Primitive.Number());
      const operation: Operation.Operation<any, any, any> = {
        kind: "either.set",
        path: OperationPath.make(""),
        payload: true, // boolean not allowed
      };

      expect(() => either._internal.applyOperation(undefined, operation)).toThrow(
        Primitive.ValidationError
      );
    });

    it("throws ValidationError for wrong operation kind", () => {
      const either = Primitive.Either(Primitive.String(), Primitive.Number());
      const operation: Operation.Operation<any, any, any> = {
        kind: "string.set",
        path: OperationPath.make(""),
        payload: "hello",
      };

      expect(() => either._internal.applyOperation(undefined, operation)).toThrow(
        Primitive.ValidationError
      );
    });

    it("throws ValidationError for object payload", () => {
      const either = Primitive.Either(Primitive.String(), Primitive.Number());
      const operation: Operation.Operation<any, any, any> = {
        kind: "either.set",
        path: OperationPath.make(""),
        payload: { invalid: true },
      };

      expect(() => either._internal.applyOperation(undefined, operation)).toThrow(
        Primitive.ValidationError
      );
    });
  });

  describe("getInitialState", () => {
    it("returns undefined when no default is set", () => {
      const either = Primitive.Either(Primitive.String(), Primitive.Number());
      expect(either._internal.getInitialState()).toBeUndefined();
    });

    it("returns the string default value when set", () => {
      const either = Primitive.Either(Primitive.String(), Primitive.Number()).default("pending");
      expect(either._internal.getInitialState()).toBe("pending");
    });

    it("returns the number default value when set", () => {
      const either = Primitive.Either(Primitive.String(), Primitive.Number()).default(0);
      expect(either._internal.getInitialState()).toBe(0);
    });

    it("returns the boolean default value when set", () => {
      const either = Primitive.Either(Primitive.String(), Primitive.Boolean()).default(false);
      expect(either._internal.getInitialState()).toBe(false);
    });
  });

  describe("schema modifiers", () => {
    it("required() returns a new EitherPrimitive", () => {
      const original = Primitive.Either(Primitive.String(), Primitive.Number());
      const required = original.required();

      expect(required).toBeInstanceOf(Primitive.EitherPrimitive);
      expect(required).not.toBe(original);
    });

    it("default() returns a new EitherPrimitive with default value", () => {
      const original = Primitive.Either(Primitive.String(), Primitive.Number());
      const withDefault = original.default("default");

      expect(withDefault).toBeInstanceOf(Primitive.EitherPrimitive);
      expect(withDefault._internal.getInitialState()).toBe("default");
    });

    it("preserves variants after required()", () => {
      const original = Primitive.Either(Primitive.String(), Primitive.Number());
      const required = original.required();

      expect(required.variants).toEqual(original.variants);
    });

    it("preserves variants after default()", () => {
      const original = Primitive.Either(Primitive.String(), Primitive.Number());
      const withDefault = original.default("default");

      expect(withDefault.variants).toEqual(original.variants);
    });
  });

  describe("multi-variant tests", () => {
    it("accepts all three scalar types", () => {
      const either = Primitive.Either(Primitive.String(), Primitive.Number(), Primitive.Boolean());

      // String
      const stringOp: Operation.Operation<any, any, any> = {
        kind: "either.set",
        path: OperationPath.make(""),
        payload: "test",
      };
      expect(either._internal.applyOperation(undefined, stringOp)).toBe("test");

      // Number
      const numberOp: Operation.Operation<any, any, any> = {
        kind: "either.set",
        path: OperationPath.make(""),
        payload: 123,
      };
      expect(either._internal.applyOperation(undefined, numberOp)).toBe(123);

      // Boolean
      const booleanOp: Operation.Operation<any, any, any> = {
        kind: "either.set",
        path: OperationPath.make(""),
        payload: false,
      };
      expect(either._internal.applyOperation(undefined, booleanOp)).toBe(false);
    });

    it("works with mixed literal and scalar types", () => {
      const either = Primitive.Either(
        Primitive.Literal("auto"),
        Primitive.Literal("manual"),
        Primitive.Number()
      );

      // Literal "auto"
      const autoOp: Operation.Operation<any, any, any> = {
        kind: "either.set",
        path: OperationPath.make(""),
        payload: "auto",
      };
      expect(either._internal.applyOperation(undefined, autoOp)).toBe("auto");

      // Literal "manual"
      const manualOp: Operation.Operation<any, any, any> = {
        kind: "either.set",
        path: OperationPath.make(""),
        payload: "manual",
      };
      expect(either._internal.applyOperation(undefined, manualOp)).toBe("manual");

      // Number
      const numberOp: Operation.Operation<any, any, any> = {
        kind: "either.set",
        path: OperationPath.make(""),
        payload: 50,
      };
      expect(either._internal.applyOperation(undefined, numberOp)).toBe(50);

      // Other string should fail (not a literal)
      const invalidOp: Operation.Operation<any, any, any> = {
        kind: "either.set",
        path: OperationPath.make(""),
        payload: "other",
      };
      expect(() => either._internal.applyOperation(undefined, invalidOp)).toThrow(
        Primitive.ValidationError
      );
    });
  });

  describe("creation validation", () => {
    it("throws when created with no variants", () => {
      expect(() => Primitive.Either()).toThrow(Primitive.ValidationError);
    });
  });

  describe("variant validator delegation", () => {
    it("validates string min length from variant", () => {
      const either = Primitive.Either(
        Primitive.String().min(2),
        Primitive.Number()
      );

      // Valid string (length >= 2)
      const validOp: Operation.Operation<any, any, any> = {
        kind: "either.set",
        path: OperationPath.make(""),
        payload: "hello",
      };
      expect(either._internal.applyOperation(undefined, validOp)).toBe("hello");

      // Invalid string (length < 2)
      const invalidOp: Operation.Operation<any, any, any> = {
        kind: "either.set",
        path: OperationPath.make(""),
        payload: "a",
      };
      expect(() => either._internal.applyOperation(undefined, invalidOp)).toThrow(
        Primitive.ValidationError
      );
    });

    it("validates string max length from variant", () => {
      const either = Primitive.Either(
        Primitive.String().max(5),
        Primitive.Number()
      );

      // Valid string (length <= 5)
      const validOp: Operation.Operation<any, any, any> = {
        kind: "either.set",
        path: OperationPath.make(""),
        payload: "hello",
      };
      expect(either._internal.applyOperation(undefined, validOp)).toBe("hello");

      // Invalid string (length > 5)
      const invalidOp: Operation.Operation<any, any, any> = {
        kind: "either.set",
        path: OperationPath.make(""),
        payload: "hello world",
      };
      expect(() => either._internal.applyOperation(undefined, invalidOp)).toThrow(
        Primitive.ValidationError
      );
    });

    it("validates number max from variant", () => {
      const either = Primitive.Either(
        Primitive.String(),
        Primitive.Number().max(255)
      );

      // Valid number (<= 255)
      const validOp: Operation.Operation<any, any, any> = {
        kind: "either.set",
        path: OperationPath.make(""),
        payload: 100,
      };
      expect(either._internal.applyOperation(undefined, validOp)).toBe(100);

      // Invalid number (> 255)
      const invalidOp: Operation.Operation<any, any, any> = {
        kind: "either.set",
        path: OperationPath.make(""),
        payload: 300,
      };
      expect(() => either._internal.applyOperation(undefined, invalidOp)).toThrow(
        Primitive.ValidationError
      );
    });

    it("validates number min from variant", () => {
      const either = Primitive.Either(
        Primitive.String(),
        Primitive.Number().min(0)
      );

      // Valid number (>= 0)
      const validOp: Operation.Operation<any, any, any> = {
        kind: "either.set",
        path: OperationPath.make(""),
        payload: 0,
      };
      expect(either._internal.applyOperation(undefined, validOp)).toBe(0);

      // Invalid number (< 0)
      const invalidOp: Operation.Operation<any, any, any> = {
        kind: "either.set",
        path: OperationPath.make(""),
        payload: -5,
      };
      expect(() => either._internal.applyOperation(undefined, invalidOp)).toThrow(
        Primitive.ValidationError
      );
    });

    it("validates combined string and number constraints", () => {
      const either = Primitive.Either(
        Primitive.String().min(2).max(50),
        Primitive.Number().max(255)
      );

      // Valid string
      const validStringOp: Operation.Operation<any, any, any> = {
        kind: "either.set",
        path: OperationPath.make(""),
        payload: "valid",
      };
      expect(either._internal.applyOperation(undefined, validStringOp)).toBe("valid");

      // Valid number
      const validNumberOp: Operation.Operation<any, any, any> = {
        kind: "either.set",
        path: OperationPath.make(""),
        payload: 200,
      };
      expect(either._internal.applyOperation(undefined, validNumberOp)).toBe(200);

      // Invalid string (too short)
      const invalidStringOp: Operation.Operation<any, any, any> = {
        kind: "either.set",
        path: OperationPath.make(""),
        payload: "a",
      };
      expect(() => either._internal.applyOperation(undefined, invalidStringOp)).toThrow(
        Primitive.ValidationError
      );

      // Invalid number (too large)
      const invalidNumberOp: Operation.Operation<any, any, any> = {
        kind: "either.set",
        path: OperationPath.make(""),
        payload: 500,
      };
      expect(() => either._internal.applyOperation(undefined, invalidNumberOp)).toThrow(
        Primitive.ValidationError
      );
    });

    it("validates string regex pattern from variant", () => {
      const either = Primitive.Either(
        Primitive.String().regex(/^[a-z]+$/),
        Primitive.Number()
      );

      // Valid string (lowercase only)
      const validOp: Operation.Operation<any, any, any> = {
        kind: "either.set",
        path: OperationPath.make(""),
        payload: "hello",
      };
      expect(either._internal.applyOperation(undefined, validOp)).toBe("hello");

      // Invalid string (has uppercase)
      const invalidOp: Operation.Operation<any, any, any> = {
        kind: "either.set",
        path: OperationPath.make(""),
        payload: "Hello",
      };
      expect(() => either._internal.applyOperation(undefined, invalidOp)).toThrow(
        Primitive.ValidationError
      );
    });

    it("validates number positive constraint from variant", () => {
      const either = Primitive.Either(
        Primitive.String(),
        Primitive.Number().positive()
      );

      // Valid positive number
      const validOp: Operation.Operation<any, any, any> = {
        kind: "either.set",
        path: OperationPath.make(""),
        payload: 1,
      };
      expect(either._internal.applyOperation(undefined, validOp)).toBe(1);

      // Invalid (zero is not positive)
      const zeroOp: Operation.Operation<any, any, any> = {
        kind: "either.set",
        path: OperationPath.make(""),
        payload: 0,
      };
      expect(() => either._internal.applyOperation(undefined, zeroOp)).toThrow(
        Primitive.ValidationError
      );

      // Invalid negative number
      const negativeOp: Operation.Operation<any, any, any> = {
        kind: "either.set",
        path: OperationPath.make(""),
        payload: -1,
      };
      expect(() => either._internal.applyOperation(undefined, negativeOp)).toThrow(
        Primitive.ValidationError
      );
    });

    it("validates number int constraint from variant", () => {
      const either = Primitive.Either(
        Primitive.String(),
        Primitive.Number().int()
      );

      // Valid integer
      const validOp: Operation.Operation<any, any, any> = {
        kind: "either.set",
        path: OperationPath.make(""),
        payload: 42,
      };
      expect(either._internal.applyOperation(undefined, validOp)).toBe(42);

      // Invalid (decimal number)
      const decimalOp: Operation.Operation<any, any, any> = {
        kind: "either.set",
        path: OperationPath.make(""),
        payload: 3.14,
      };
      expect(() => either._internal.applyOperation(undefined, decimalOp)).toThrow(
        Primitive.ValidationError
      );
    });
  });
});

