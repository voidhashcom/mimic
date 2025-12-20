import { describe, expect, it } from "@effect/vitest";
import * as Primitive from "../src/Primitive";
import * as ProxyEnvironment from "../src/ProxyEnvironment";
import * as OperationPath from "../src/OperationPath";
import * as Operation from "../src/Operation";

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

describe("StructPrimitive", () => {
  describe("proxy", () => {
    it("nested field access returns field primitive proxy", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => {
        operations.push(op);
      });

      const structPrimitive = Primitive.Struct({
        name: Primitive.String().required(),
        title: Primitive.String(),
      });

      const proxy = structPrimitive._internal.createProxy(env, OperationPath.make(""));

      // Access nested field and call set
      proxy.name.set("John Doe");

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("string.set");
      expect(operations[0]!.payload).toBe("John Doe");
      expect(operations[0]!.path.toTokens()).toEqual(["name"]);
    });

    it("nested field paths are constructed correctly", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => {
        operations.push(op);
      });

      const structPrimitive = Primitive.Struct({
        name: Primitive.String(),
        email: Primitive.String(),
      });

      const proxy = structPrimitive._internal.createProxy(env, OperationPath.make("users/0"));

      proxy.email.set("test@example.com");

      expect(operations[0]!.path.toTokens()).toEqual(["users", "0", "email"]);
    });

    it("set() on struct generates struct.set operation", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => {
        operations.push(op);
      });

      const structPrimitive = Primitive.Struct({
        name: Primitive.String(),
        age: Primitive.String(),
      });

      const proxy = structPrimitive._internal.createProxy(env, OperationPath.make(""));

      proxy.set({ name: "Alice", age: "30" });

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("struct.set");
      expect(operations[0]!.payload).toEqual({ name: "Alice", age: "30" });
    });

    it("multiple field sets generate separate operations", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => {
        operations.push(op);
      });

      const structPrimitive = Primitive.Struct({
        firstName: Primitive.String(),
        lastName: Primitive.String(),
      });

      const proxy = structPrimitive._internal.createProxy(env, OperationPath.make(""));

      proxy.firstName.set("John");
      proxy.lastName.set("Doe");

      expect(operations).toHaveLength(2);
      expect(operations[0]!.payload).toBe("John");
      expect(operations[1]!.payload).toBe("Doe");
    });
  });

  describe("applyOperation", () => {
    it("struct.set replaces entire struct state", () => {
      const structPrimitive = Primitive.Struct({
        name: Primitive.String(),
        email: Primitive.String(),
      });

      const operation: Operation.Operation<any, any, any> = {
        kind: "struct.set",
        path: OperationPath.make(""),
        payload: { name: "Bob", email: "bob@test.com" },
      };

      const result = structPrimitive._internal.applyOperation(undefined, operation);

      expect(result).toEqual({ name: "Bob", email: "bob@test.com" });
    });

    it("delegates field operations to nested primitives", () => {
      const structPrimitive = Primitive.Struct({
        name: Primitive.String(),
        title: Primitive.String(),
      });

      const operation: Operation.Operation<any, any, any> = {
        kind: "string.set",
        path: OperationPath.make("name"),
        payload: "Updated Name",
      };

      const currentState = { name: "Original", title: "Mr" };
      const result = structPrimitive._internal.applyOperation(currentState, operation);

      expect(result).toEqual({ name: "Updated Name", title: "Mr" });
    });

    it("creates state from undefined when applying field operation", () => {
      const structPrimitive = Primitive.Struct({
        name: Primitive.String(),
      });

      const operation: Operation.Operation<any, any, any> = {
        kind: "string.set",
        path: OperationPath.make("name"),
        payload: "New Name",
      };

      const result = structPrimitive._internal.applyOperation(undefined, operation);

      expect(result).toEqual({ name: "New Name" });
    });

    it("throws ValidationError for unknown field", () => {
      const structPrimitive = Primitive.Struct({
        name: Primitive.String(),
      });

      const operation: Operation.Operation<any, any, any> = {
        kind: "string.set",
        path: OperationPath.make("unknownField"),
        payload: "value",
      };

      expect(() => structPrimitive._internal.applyOperation(undefined, operation)).toThrow(
        Primitive.ValidationError
      );
    });

    it("throws ValidationError for non-object payload on struct.set", () => {
      const structPrimitive = Primitive.Struct({
        name: Primitive.String(),
      });

      const operation: Operation.Operation<any, any, any> = {
        kind: "struct.set",
        path: OperationPath.make(""),
        payload: "not an object",
      };

      expect(() => structPrimitive._internal.applyOperation(undefined, operation)).toThrow(
        Primitive.ValidationError
      );
    });
  });

  describe("getInitialState", () => {
    it("returns undefined when no field has defaults", () => {
      const structPrimitive = Primitive.Struct({
        name: Primitive.String(),
        email: Primitive.String(),
      });

      expect(structPrimitive._internal.getInitialState()).toBeUndefined();
    });

    it("returns partial state from field defaults", () => {
      const structPrimitive = Primitive.Struct({
        name: Primitive.String().default("Anonymous"),
        email: Primitive.String(),
      });

      const initialState = structPrimitive._internal.getInitialState();

      expect(initialState).toEqual({ name: "Anonymous" });
    });

    it("returns complete state when all fields have defaults", () => {
      const structPrimitive = Primitive.Struct({
        name: Primitive.String().default("Guest"),
        role: Primitive.String().default("user"),
      });

      const initialState = structPrimitive._internal.getInitialState();

      expect(initialState).toEqual({ name: "Guest", role: "user" });
    });

    it("uses struct default value over field defaults", () => {
      const structPrimitive = Primitive.Struct({
        name: Primitive.String().default("Field Default"),
      }).default({ name: "Struct Default" });

      const initialState = structPrimitive._internal.getInitialState();

      expect(initialState).toEqual({ name: "Struct Default" });
    });
  });

  describe("nested structs", () => {
    it("supports nested struct primitives", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => {
        operations.push(op);
      });

      const addressPrimitive = Primitive.Struct({
        street: Primitive.String(),
        city: Primitive.String(),
      });

      const personPrimitive = Primitive.Struct({
        name: Primitive.String(),
        address: addressPrimitive,
      });

      const proxy = personPrimitive._internal.createProxy(env, OperationPath.make(""));

      proxy.address.city.set("New York");

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("string.set");
      expect(operations[0]!.payload).toBe("New York");
      expect(operations[0]!.path.toTokens()).toEqual(["address", "city"]);
    });

    it("applies operations to nested structs", () => {
      const addressPrimitive = Primitive.Struct({
        street: Primitive.String(),
        city: Primitive.String(),
      });

      const personPrimitive = Primitive.Struct({
        name: Primitive.String(),
        address: addressPrimitive,
      });

      const operation: Operation.Operation<any, any, any> = {
        kind: "string.set",
        path: OperationPath.make("address/city"),
        payload: "Los Angeles",
      };

      const currentState = {
        name: "John",
        address: { street: "123 Main St", city: "San Francisco" },
      };

      const result = personPrimitive._internal.applyOperation(currentState, operation);

      expect(result).toEqual({
        name: "John",
        address: { street: "123 Main St", city: "Los Angeles" },
      });
    });
  });

  describe("type inference", () => {
    it("infers correct state type from struct definition", () => {
      const structPrimitive = Primitive.Struct({
        name: Primitive.String(),
        email: Primitive.String(),
      });

      // This is a compile-time check - the type should be inferred correctly
      type ExpectedState = Primitive.InferState<typeof structPrimitive>;
      const state: ExpectedState = { name: "test", email: "test@test.com" };

      expect(state).toEqual({ name: "test", email: "test@test.com" });
    });

    it("infers correct proxy type with field access", () => {
      const structPrimitive = Primitive.Struct({
        name: Primitive.String(),
      });

      type ExpectedProxy = Primitive.InferProxy<typeof structPrimitive>;

      // This would fail at compile time if types are wrong
      const env = ProxyEnvironment.make(() => {});
      const proxy: ExpectedProxy = structPrimitive._internal.createProxy(env, OperationPath.make(""));

      // Verify the proxy has the expected shape
      expect(typeof proxy.name.set).toBe("function");
      expect(typeof proxy.set).toBe("function");
    });
  });
});

// =============================================================================
// Array Primitive Tests (Ordered with ID + Fractional Index)
// =============================================================================

describe("ArrayPrimitive", () => {
  // Helper to create a mock environment with state access
  const createEnvWithState = (
    state: Primitive.ArrayEntry<any>[] = []
  ): { env: ReturnType<typeof ProxyEnvironment.make>; operations: Operation.Operation<any, any, any>[] } => {
    const operations: Operation.Operation<any, any, any>[] = [];
    let currentState = [...state];
    
    const env = ProxyEnvironment.make({
      onOperation: (op) => {
        operations.push(op);
        // Apply operation to keep state in sync for subsequent operations
        if (op.kind === "array.insert") {
          currentState.push(op.payload);
        } else if (op.kind === "array.remove") {
          currentState = currentState.filter(e => e.id !== op.payload.id);
        } else if (op.kind === "array.move") {
          currentState = currentState.map(e => 
            e.id === op.payload.id ? { ...e, pos: op.payload.pos } : e
          );
        } else if (op.kind === "array.set") {
          currentState = op.payload;
        }
      },
      getState: () => currentState,
      generateId: () => crypto.randomUUID(),
    });
    
    return { env, operations };
  };

  describe("proxy", () => {
    it("set() generates array.set operation with entries", () => {
      const { env, operations } = createEnvWithState();
      const arrayPrimitive = Primitive.Array(Primitive.String());
      const proxy = arrayPrimitive._internal.createProxy(env, OperationPath.make(""));

      proxy.set(["a", "b", "c"]);

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("array.set");
      
      const entries = operations[0]!.payload as Primitive.ArrayEntry<string>[];
      expect(entries).toHaveLength(3);
      expect(entries[0]!.value).toBe("a");
      expect(entries[1]!.value).toBe("b");
      expect(entries[2]!.value).toBe("c");
      
      // Each entry should have an ID and position
      entries.forEach((entry: Primitive.ArrayEntry<string>) => {
        expect(typeof entry.id).toBe("string");
        expect(typeof entry.pos).toBe("string");
      });
      
      // Positions should be in order
      expect(entries[0]!.pos < entries[1]!.pos).toBe(true);
      expect(entries[1]!.pos < entries[2]!.pos).toBe(true);
    });

    it("push() generates array.insert operation with ID and position", () => {
      const { env, operations } = createEnvWithState();
      const arrayPrimitive = Primitive.Array(Primitive.String());
      const proxy = arrayPrimitive._internal.createProxy(env, OperationPath.make(""));

      proxy.push("newItem");

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("array.insert");
      
      const payload = operations[0]!.payload as { id: string; pos: string; value: string };
      expect(payload.value).toBe("newItem");
      expect(typeof payload.id).toBe("string");
      expect(typeof payload.pos).toBe("string");
    });

    it("push() generates position after last element", () => {
      const existingEntry = { id: "existing-id", pos: "a0", value: "existing" };
      const { env, operations } = createEnvWithState([existingEntry]);
      const arrayPrimitive = Primitive.Array(Primitive.String());
      const proxy = arrayPrimitive._internal.createProxy(env, OperationPath.make(""));

      proxy.push("newItem");

      const payload = operations[0]!.payload as { id: string; pos: string; value: string };
      expect(payload.pos > existingEntry.pos).toBe(true);
    });

    it("insertAt() generates array.insert with position between neighbors", () => {
      const entries = [
        { id: "id1", pos: "a0", value: "first" },
        { id: "id2", pos: "a2", value: "third" },
      ];
      const { env, operations } = createEnvWithState(entries);
      const arrayPrimitive = Primitive.Array(Primitive.String());
      const proxy = arrayPrimitive._internal.createProxy(env, OperationPath.make(""));

      proxy.insertAt(1, "second");

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("array.insert");
      
      const payload = operations[0]!.payload as { id: string; pos: string; value: string };
      expect(payload.value).toBe("second");
      // Position should be between a0 and a2
      expect(payload.pos > "a0").toBe(true);
      expect(payload.pos < "a2").toBe(true);
    });

    it("insertAt(0) generates position before first element", () => {
      const entries = [{ id: "id1", pos: "a0", value: "existing" }];
      const { env, operations } = createEnvWithState(entries);
      const arrayPrimitive = Primitive.Array(Primitive.String());
      const proxy = arrayPrimitive._internal.createProxy(env, OperationPath.make(""));

      proxy.insertAt(0, "first");

      const payload = operations[0]!.payload as { id: string; pos: string; value: string };
      expect(payload.pos < "a0").toBe(true);
    });

    it("remove() generates array.remove operation with ID", () => {
      const { env, operations } = createEnvWithState();
      const arrayPrimitive = Primitive.Array(Primitive.String());
      const proxy = arrayPrimitive._internal.createProxy(env, OperationPath.make(""));

      proxy.remove("some-id");

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("array.remove");
      expect(operations[0]!.payload).toEqual({ id: "some-id" });
    });

    it("move() generates array.move operation with new position", () => {
      const entries = [
        { id: "id1", pos: "a0", value: "first" },
        { id: "id2", pos: "a1", value: "second" },
        { id: "id3", pos: "a2", value: "third" },
      ];
      const { env, operations } = createEnvWithState(entries);
      const arrayPrimitive = Primitive.Array(Primitive.String());
      const proxy = arrayPrimitive._internal.createProxy(env, OperationPath.make(""));

      // Move first element to end
      proxy.move("id1", 3);

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("array.move");
      
      const payload = operations[0]!.payload as { id: string; pos: string };
      expect(payload.id).toBe("id1");
      // New position should be after a2
      expect(payload.pos > "a2").toBe(true);
    });

    it("at() returns element proxy with ID in path", () => {
      const { env, operations } = createEnvWithState();
      const arrayPrimitive = Primitive.Array(Primitive.String());
      const proxy = arrayPrimitive._internal.createProxy(env, OperationPath.make("items"));

      const elementProxy = proxy.at("some-uuid");
      elementProxy.set("element value");

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("string.set");
      expect(operations[0]!.path.toTokens()).toEqual(["items", "some-uuid"]);
    });

    it("at() with nested struct returns nested proxy", () => {
      const { env, operations } = createEnvWithState();
      const arrayPrimitive = Primitive.Array(
        Primitive.Struct({
          name: Primitive.String(),
          age: Primitive.Number(),
        })
      );
      const proxy = arrayPrimitive._internal.createProxy(env, OperationPath.make("users"));

      proxy.at("user-id-123").name.set("John");

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("string.set");
      expect(operations[0]!.path.toTokens()).toEqual(["users", "user-id-123", "name"]);
    });

    it("find() returns proxy for matching element", () => {
      const entries = [
        { id: "id1", pos: "a0", value: "alice" },
        { id: "id2", pos: "a1", value: "bob" },
      ];
      const { env, operations } = createEnvWithState(entries);
      const arrayPrimitive = Primitive.Array(Primitive.String());
      const proxy = arrayPrimitive._internal.createProxy(env, OperationPath.make(""));

      const found = proxy.find((value) => value === "bob");
      expect(found).toBeDefined();
      
      found!.set("robert");
      
      expect(operations[0]!.path.toTokens()).toEqual(["id2"]);
    });
  });

  describe("applyOperation", () => {
    it("array.set replaces entire array with entries", () => {
      const arrayPrimitive = Primitive.Array(Primitive.String());
      const newEntries: Primitive.ArrayEntry<string>[] = [
        { id: "id1", pos: "a0", value: "x" },
        { id: "id2", pos: "a1", value: "y" },
      ];
      const operation: Operation.Operation<any, any, any> = {
        kind: "array.set",
        path: OperationPath.make(""),
        payload: newEntries,
      };

      const result = arrayPrimitive._internal.applyOperation([], operation);
      expect(result).toEqual(newEntries);
    });

    it("array.insert adds new entry to array", () => {
      const arrayPrimitive = Primitive.Array(Primitive.String());
      const existingEntries: Primitive.ArrayEntry<string>[] = [
        { id: "id1", pos: "a0", value: "existing" },
      ];
      const operation: Operation.Operation<any, any, any> = {
        kind: "array.insert",
        path: OperationPath.make(""),
        payload: { id: "id2", pos: "a1", value: "new" },
      };

      const result = arrayPrimitive._internal.applyOperation(existingEntries, operation);
      expect(result).toHaveLength(2);
      expect(result[1]).toEqual({ id: "id2", pos: "a1", value: "new" });
    });

    it("array.insert works with undefined state", () => {
      const arrayPrimitive = Primitive.Array(Primitive.String());
      const operation: Operation.Operation<any, any, any> = {
        kind: "array.insert",
        path: OperationPath.make(""),
        payload: { id: "id1", pos: "a0", value: "first" },
      };

      const result = arrayPrimitive._internal.applyOperation(undefined, operation);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ id: "id1", pos: "a0", value: "first" });
    });

    it("array.remove removes entry by ID", () => {
      const arrayPrimitive = Primitive.Array(Primitive.String());
      const entries: Primitive.ArrayEntry<string>[] = [
        { id: "id1", pos: "a0", value: "a" },
        { id: "id2", pos: "a1", value: "b" },
        { id: "id3", pos: "a2", value: "c" },
      ];
      const operation: Operation.Operation<any, any, any> = {
        kind: "array.remove",
        path: OperationPath.make(""),
        payload: { id: "id2" },
      };

      const result = arrayPrimitive._internal.applyOperation(entries, operation);
      expect(result).toHaveLength(2);
      expect(result.map(e => e.id)).toEqual(["id1", "id3"]);
    });

    it("array.move updates entry position", () => {
      const arrayPrimitive = Primitive.Array(Primitive.String());
      const entries: Primitive.ArrayEntry<string>[] = [
        { id: "id1", pos: "a0", value: "first" },
        { id: "id2", pos: "a1", value: "second" },
      ];
      const operation: Operation.Operation<any, any, any> = {
        kind: "array.move",
        path: OperationPath.make(""),
        payload: { id: "id1", pos: "a2" },
      };

      const result = arrayPrimitive._internal.applyOperation(entries, operation);
      const movedEntry = result.find(e => e.id === "id1");
      expect(movedEntry!.pos).toBe("a2");
      expect(movedEntry!.value).toBe("first");
    });

    it("delegates element operations by ID", () => {
      const arrayPrimitive = Primitive.Array(Primitive.String());
      const entries: Primitive.ArrayEntry<string>[] = [
        { id: "id1", pos: "a0", value: "a" },
        { id: "id2", pos: "a1", value: "b" },
      ];
      const operation: Operation.Operation<any, any, any> = {
        kind: "string.set",
        path: OperationPath.make("id2"),
        payload: "updated",
      };

      const result = arrayPrimitive._internal.applyOperation(entries, operation);
      expect(result[1]!.value).toBe("updated");
      expect(result[1]!.id).toBe("id2");
      expect(result[1]!.pos).toBe("a1");
    });

    it("delegates nested struct operations by ID", () => {
      const arrayPrimitive = Primitive.Array(
        Primitive.Struct({
          name: Primitive.String(),
        })
      );
      const entries: Primitive.ArrayEntry<{ name: string }>[] = [
        { id: "user-1", pos: "a0", value: { name: "Original" } },
      ];
      const operation: Operation.Operation<any, any, any> = {
        kind: "string.set",
        path: OperationPath.make("user-1/name"),
        payload: "Updated Name",
      };

      const result = arrayPrimitive._internal.applyOperation(entries, operation);
      expect(result[0]!.value.name).toBe("Updated Name");
    });

    it("throws ValidationError for non-array payload on set", () => {
      const arrayPrimitive = Primitive.Array(Primitive.String());
      const operation: Operation.Operation<any, any, any> = {
        kind: "array.set",
        path: OperationPath.make(""),
        payload: "not an array",
      };

      expect(() => arrayPrimitive._internal.applyOperation(undefined, operation)).toThrow(
        Primitive.ValidationError
      );
    });

    it("throws ValidationError for unknown element ID", () => {
      const arrayPrimitive = Primitive.Array(Primitive.String());
      const entries: Primitive.ArrayEntry<string>[] = [
        { id: "id1", pos: "a0", value: "a" },
      ];
      const operation: Operation.Operation<any, any, any> = {
        kind: "string.set",
        path: OperationPath.make("unknown-id"),
        payload: "value",
      };

      expect(() => arrayPrimitive._internal.applyOperation(entries, operation)).toThrow(
        Primitive.ValidationError
      );
    });
  });

  describe("getInitialState", () => {
    it("returns undefined when no default is set", () => {
      const arrayPrimitive = Primitive.Array(Primitive.String());
      expect(arrayPrimitive._internal.getInitialState()).toBeUndefined();
    });

    it("returns the default value when set", () => {
      const defaultEntries: Primitive.ArrayEntry<string>[] = [
        { id: "id1", pos: "a0", value: "a" },
        { id: "id2", pos: "a1", value: "b" },
      ];
      const arrayPrimitive = Primitive.Array(Primitive.String()).default(defaultEntries);
      expect(arrayPrimitive._internal.getInitialState()).toEqual(defaultEntries);
    });
  });

  describe("fractional index ordering", () => {
    it("entries are sorted by position when accessed", () => {
      const arrayPrimitive = Primitive.Array(Primitive.String());
      // Entries stored out of order
      const entries: Primitive.ArrayEntry<string>[] = [
        { id: "id3", pos: "a2", value: "third" },
        { id: "id1", pos: "a0", value: "first" },
        { id: "id2", pos: "a1", value: "second" },
      ];

      // Apply a move operation - it should work regardless of storage order
      const operation: Operation.Operation<any, any, any> = {
        kind: "array.move",
        path: OperationPath.make(""),
        payload: { id: "id1", pos: "a3" },
      };

      const result = arrayPrimitive._internal.applyOperation(entries, operation);
      const movedEntry = result.find(e => e.id === "id1");
      expect(movedEntry!.pos).toBe("a3");
    });

    it("multiple inserts generate valid ordering", () => {
      const { env, operations } = createEnvWithState();
      const arrayPrimitive = Primitive.Array(Primitive.String());
      const proxy = arrayPrimitive._internal.createProxy(env, OperationPath.make(""));

      // Push multiple items
      proxy.push("first");
      proxy.push("second");
      proxy.push("third");

      expect(operations).toHaveLength(3);
      
      const positions = operations.map(op => (op.payload as { pos: string }).pos);
      // All positions should be different and in order
      expect(positions[0]! < positions[1]!).toBe(true);
      expect(positions[1]! < positions[2]!).toBe(true);
    });
  });
});

// =============================================================================
// Lazy Primitive Tests
// =============================================================================

describe("LazyPrimitive", () => {
  describe("proxy", () => {
    it("delegates proxy creation to resolved primitive", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => operations.push(op));

      const lazyPrimitive = Primitive.Lazy(() => Primitive.String());
      const proxy = lazyPrimitive._internal.createProxy(env, OperationPath.make(""));

      proxy.set("lazy value");

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("string.set");
      expect(operations[0]!.payload).toBe("lazy value");
    });

    it("works with lazy struct", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => operations.push(op));

      const lazyPrimitive = Primitive.Lazy(() =>
        Primitive.Struct({
          name: Primitive.String(),
        })
      );
      const proxy = lazyPrimitive._internal.createProxy(env, OperationPath.make(""));

      proxy.name.set("lazy struct field");

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("string.set");
      expect(operations[0]!.path.toTokens()).toEqual(["name"]);
    });
  });

  describe("applyOperation", () => {
    it("delegates operation application to resolved primitive", () => {
      const lazyPrimitive = Primitive.Lazy(() => Primitive.String());
      const operation: Operation.Operation<any, any, any> = {
        kind: "string.set",
        path: OperationPath.make(""),
        payload: "lazy applied",
      };

      const result = lazyPrimitive._internal.applyOperation(undefined, operation);
      expect(result).toBe("lazy applied");
    });

    it("works with lazy struct operations", () => {
      const lazyPrimitive = Primitive.Lazy(() =>
        Primitive.Struct({
          name: Primitive.String(),
        })
      );
      const operation: Operation.Operation<any, any, any> = {
        kind: "string.set",
        path: OperationPath.make("name"),
        payload: "Updated",
      };

      const result = lazyPrimitive._internal.applyOperation({ name: "Original" }, operation);
      expect(result).toEqual({ name: "Updated" });
    });
  });

  describe("getInitialState", () => {
    it("delegates to resolved primitive", () => {
      const lazyPrimitive = Primitive.Lazy(() => Primitive.String().default("lazy default"));
      expect(lazyPrimitive._internal.getInitialState()).toBe("lazy default");
    });

    it("returns undefined when resolved primitive has no default", () => {
      const lazyPrimitive = Primitive.Lazy(() => Primitive.String());
      expect(lazyPrimitive._internal.getInitialState()).toBeUndefined();
    });
  });

  describe("recursive structures", () => {
    it("supports self-referential structures", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => operations.push(op));

      // Define a recursive node structure
      const Node: Primitive.LazyPrimitive<any> = Primitive.Lazy(() =>
        Primitive.Struct({
          name: Primitive.String(),
          children: Primitive.Array(Node),
        })
      );

      const proxy = Node._internal.createProxy(env, OperationPath.make("")) as any;

      // Access nested child
      proxy.children.at(0).name.set("Child Name");

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("string.set");
      expect(operations[0]!.path.toTokens()).toEqual(["children", "0", "name"]);
    });

    it("applies operations to recursive structures", () => {
      const Node: Primitive.LazyPrimitive<any> = Primitive.Lazy(() =>
        Primitive.Struct({
          name: Primitive.String(),
          children: Primitive.Array(Node),
        })
      );

      // Use entry ID in path (arrays now use ID-based addressing)
      const operation: Operation.Operation<any, any, any> = {
        kind: "string.set",
        path: OperationPath.make("children/child-entry-1/name"),
        payload: "Updated Child",
      };

      // State with array entries format { id, pos, value }
      const state = {
        name: "Root",
        children: [
          { id: "child-entry-1", pos: "a0", value: { name: "Child", children: [] } }
        ],
      };

      const result = Node._internal.applyOperation(state, operation);
      expect(result).toEqual({
        name: "Root",
        children: [
          { id: "child-entry-1", pos: "a0", value: { name: "Updated Child", children: [] } }
        ],
      });
    });
  });
});

// =============================================================================
// Union Primitive Tests
// =============================================================================

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

describe("Integration - Complex Nested Structures", () => {
  it("struct with all primitive types", () => {
    const operations: Operation.Operation<any, any, any>[] = [];
    const env = ProxyEnvironment.make((op) => operations.push(op));

    const complexStruct = Primitive.Struct({
      name: Primitive.String(),
      age: Primitive.Number(),
      active: Primitive.Boolean(),
      status: Primitive.Literal("online" as const),
    });

    const proxy = complexStruct._internal.createProxy(env, OperationPath.make(""));

    proxy.name.set("Alice");
    proxy.age.set(30);
    proxy.active.set(true);
    proxy.status.set("online");

    expect(operations).toHaveLength(4);
    expect(operations[0]!.kind).toBe("string.set");
    expect(operations[1]!.kind).toBe("number.set");
    expect(operations[2]!.kind).toBe("boolean.set");
    expect(operations[3]!.kind).toBe("literal.set");
  });

  it("array of structs with union fields", () => {
    const ValueUnion = Primitive.Union({
      variants: {
        text: Primitive.Struct({
          type: Primitive.Literal("text" as const),
          content: Primitive.String(),
        }),
        number: Primitive.Struct({
          type: Primitive.Literal("number" as const),
          value: Primitive.Number(),
        }),
      },
    });

    const Item = Primitive.Struct({
      id: Primitive.String(),
      data: ValueUnion,
    });

    const List = Primitive.Array(Item);

    const operations: Operation.Operation<any, any, any>[] = [];
    const env = ProxyEnvironment.make({
      onOperation: (op) => operations.push(op),
      generateId: () => "generated-uuid",
    });

    const proxy = List._internal.createProxy(env, OperationPath.make(""));

    // Push a new item
    proxy.push({ id: "1", data: { type: "text", content: "Hello" } });

    // Update nested union field using the generated ID
    proxy.at("generated-uuid").data.as("text").content.set("Updated");

    expect(operations).toHaveLength(2);
    expect(operations[0]!.kind).toBe("array.insert");
    expect(operations[1]!.kind).toBe("string.set");
    expect(operations[1]!.path.toTokens()).toEqual(["generated-uuid", "data", "content"]);
  });

  it("deeply nested recursive structure with array entries", () => {
    // Tree node structure with ordered arrays
    const TreeNode: Primitive.LazyPrimitive<any> = Primitive.Lazy(() =>
      Primitive.Struct({
        id: Primitive.String(),
        label: Primitive.String(),
        expanded: Primitive.Boolean().default(false),
        children: Primitive.Array(TreeNode),
      })
    );

    // Apply deeply nested operation using array entry IDs
    const operation: Operation.Operation<any, any, any> = {
      kind: "string.set",
      path: OperationPath.make("children/child1-entry/children/grandchild2-entry/label"),
      payload: "Deep Node",
    };

    // State with array entries format { id, pos, value }
    const state = {
      id: "root",
      label: "Root",
      expanded: true,
      children: [
        {
          id: "child1-entry",
          pos: "a0",
          value: {
            id: "child1",
            label: "Child 1",
            expanded: false,
            children: [
              { id: "grandchild1-entry", pos: "a0", value: { id: "grandchild1", label: "Grandchild 1", expanded: false, children: [] } },
              { id: "grandchild2-entry", pos: "a1", value: { id: "grandchild2", label: "Original", expanded: false, children: [] } },
            ],
          },
        },
      ],
    };

    const result = TreeNode._internal.applyOperation(state, operation) as typeof state;

    expect(result.children[0]!.value.children[1]!.value.label).toBe("Deep Node");
    // Other fields should be unchanged
    expect(result.id).toBe("root");
    expect(result.children[0]!.value.id).toBe("child1");
  });
});

// =============================================================================
// transformOperation Tests
// =============================================================================

describe("transformOperation", () => {
  // Helper to create mock operations
  const makeOp = (kind: string, path: string, payload: any) => ({
    kind,
    path: OperationPath.make(path),
    payload,
  });

  describe("StringPrimitive", () => {
    const stringPrimitive = Primitive.String();

    it("should pass through operations on different paths", () => {
      const clientOp = makeOp("string.set", "title", "client value");
      const serverOp = makeOp("string.set", "description", "server value");

      const result = stringPrimitive._internal.transformOperation(clientOp, serverOp);

      expect(result.type).toBe("transformed");
      if (result.type === "transformed") {
        expect(result.operation.payload).toBe("client value");
      }
    });

    it("should let client win for same path (last-write-wins)", () => {
      const clientOp = makeOp("string.set", "", "client value");
      const serverOp = makeOp("string.set", "", "server value");

      const result = stringPrimitive._internal.transformOperation(clientOp, serverOp);

      expect(result.type).toBe("transformed");
      if (result.type === "transformed") {
        expect(result.operation.payload).toBe("client value");
      }
    });
  });

  describe("NumberPrimitive", () => {
    const numberPrimitive = Primitive.Number();

    it("should pass through operations on different paths", () => {
      const clientOp = makeOp("number.set", "count", 10);
      const serverOp = makeOp("number.set", "total", 100);

      const result = numberPrimitive._internal.transformOperation(clientOp, serverOp);

      expect(result.type).toBe("transformed");
      if (result.type === "transformed") {
        expect(result.operation.payload).toBe(10);
      }
    });

    it("should let client win for same path", () => {
      const clientOp = makeOp("number.set", "", 42);
      const serverOp = makeOp("number.set", "", 100);

      const result = numberPrimitive._internal.transformOperation(clientOp, serverOp);

      expect(result.type).toBe("transformed");
      if (result.type === "transformed") {
        expect(result.operation.payload).toBe(42);
      }
    });
  });

  describe("BooleanPrimitive", () => {
    const booleanPrimitive = Primitive.Boolean();

    it("should pass through operations on different paths", () => {
      const clientOp = makeOp("boolean.set", "active", true);
      const serverOp = makeOp("boolean.set", "visible", false);

      const result = booleanPrimitive._internal.transformOperation(clientOp, serverOp);

      expect(result.type).toBe("transformed");
      if (result.type === "transformed") {
        expect(result.operation.payload).toBe(true);
      }
    });

    it("should let client win for same path", () => {
      const clientOp = makeOp("boolean.set", "", true);
      const serverOp = makeOp("boolean.set", "", false);

      const result = booleanPrimitive._internal.transformOperation(clientOp, serverOp);

      expect(result.type).toBe("transformed");
      if (result.type === "transformed") {
        expect(result.operation.payload).toBe(true);
      }
    });
  });

  describe("LiteralPrimitive", () => {
    const literalPrimitive = Primitive.Literal("active" as const);

    it("should pass through operations on different paths", () => {
      const clientOp = makeOp("literal.set", "status", "active");
      const serverOp = makeOp("literal.set", "mode", "active");

      const result = literalPrimitive._internal.transformOperation(clientOp, serverOp);

      expect(result.type).toBe("transformed");
    });

    it("should let client win for same path", () => {
      const clientOp = makeOp("literal.set", "", "active");
      const serverOp = makeOp("literal.set", "", "active");

      const result = literalPrimitive._internal.transformOperation(clientOp, serverOp);

      expect(result.type).toBe("transformed");
    });
  });

  describe("ArrayPrimitive", () => {
    const arrayPrimitive = Primitive.Array(Primitive.String());

    it("should noop client operation when server removes target element", () => {
      const clientOp = makeOp("string.set", "item-1", "updated");
      const serverOp = makeOp("array.remove", "", { id: "item-1" });

      const result = arrayPrimitive._internal.transformOperation(clientOp, serverOp);

      expect(result.type).toBe("noop");
    });

    it("should pass through client operation when server removes different element", () => {
      const clientOp = makeOp("string.set", "item-1", "updated");
      const serverOp = makeOp("array.remove", "", { id: "item-2" });

      const result = arrayPrimitive._internal.transformOperation(clientOp, serverOp);

      expect(result.type).toBe("transformed");
    });

    it("should allow both inserts (fractional indexing handles order)", () => {
      const clientOp = makeOp("array.insert", "", { id: "new-1", pos: "a1", value: "client" });
      const serverOp = makeOp("array.insert", "", { id: "new-2", pos: "a0", value: "server" });

      const result = arrayPrimitive._internal.transformOperation(clientOp, serverOp);

      expect(result.type).toBe("transformed");
      if (result.type === "transformed") {
        expect(result.operation.payload.id).toBe("new-1");
      }
    });

    it("should let client win when both move same element", () => {
      const clientOp = makeOp("array.move", "", { id: "item-1", pos: "z0" });
      const serverOp = makeOp("array.move", "", { id: "item-1", pos: "a0" });

      const result = arrayPrimitive._internal.transformOperation(clientOp, serverOp);

      expect(result.type).toBe("transformed");
      if (result.type === "transformed") {
        expect(result.operation.payload.pos).toBe("z0");
      }
    });

    it("should pass through when moving different elements", () => {
      const clientOp = makeOp("array.move", "", { id: "item-1", pos: "z0" });
      const serverOp = makeOp("array.move", "", { id: "item-2", pos: "a0" });

      const result = arrayPrimitive._internal.transformOperation(clientOp, serverOp);

      expect(result.type).toBe("transformed");
    });

    it("should pass through operations on different array elements", () => {
      const clientOp = makeOp("string.set", "item-1", "client");
      const serverOp = makeOp("string.set", "item-2", "server");

      const result = arrayPrimitive._internal.transformOperation(clientOp, serverOp);

      expect(result.type).toBe("transformed");
    });
  });

  describe("StructPrimitive", () => {
    const structPrimitive = Primitive.Struct({
      name: Primitive.String(),
      email: Primitive.String(),
      count: Primitive.Number(),
    });

    it("should pass through operations on different fields", () => {
      const clientOp = makeOp("string.set", "name", "John");
      const serverOp = makeOp("string.set", "email", "john@example.com");

      const result = structPrimitive._internal.transformOperation(clientOp, serverOp);

      expect(result.type).toBe("transformed");
      if (result.type === "transformed") {
        expect(result.operation.payload).toBe("John");
      }
    });

    it("should let client win for same field (delegated)", () => {
      const clientOp = makeOp("string.set", "name", "Client Name");
      const serverOp = makeOp("string.set", "name", "Server Name");

      const result = structPrimitive._internal.transformOperation(clientOp, serverOp);

      expect(result.type).toBe("transformed");
      if (result.type === "transformed") {
        expect(result.operation.payload).toBe("Client Name");
      }
    });

    it("should let client struct.set win over server struct.set", () => {
      const clientOp = makeOp("struct.set", "", { name: "Client", email: "c@test.com", count: 1 });
      const serverOp = makeOp("struct.set", "", { name: "Server", email: "s@test.com", count: 2 });

      const result = structPrimitive._internal.transformOperation(clientOp, serverOp);

      expect(result.type).toBe("transformed");
      if (result.type === "transformed") {
        expect(result.operation.payload.name).toBe("Client");
      }
    });

    it("should let client field update proceed after server struct.set", () => {
      const clientOp = makeOp("string.set", "name", "Updated Name");
      const serverOp = makeOp("struct.set", "", { name: "Server", email: "s@test.com", count: 0 });

      const result = structPrimitive._internal.transformOperation(clientOp, serverOp);

      expect(result.type).toBe("transformed");
    });

    it("should let client struct.set supersede server field update", () => {
      const clientOp = makeOp("struct.set", "", { name: "Client", email: "c@test.com", count: 0 });
      const serverOp = makeOp("string.set", "name", "Server Name");

      const result = structPrimitive._internal.transformOperation(clientOp, serverOp);

      expect(result.type).toBe("transformed");
      if (result.type === "transformed") {
        expect(result.operation.payload.name).toBe("Client");
      }
    });
  });

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

    it("should pass through operations on different fields", () => {
      const clientOp = makeOp("string.set", "content", "client text");
      const serverOp = makeOp("number.set", "value", 100);

      const result = unionPrimitive._internal.transformOperation(clientOp, serverOp);

      expect(result.type).toBe("transformed");
    });

    it("should let client win for same field", () => {
      const clientOp = makeOp("string.set", "content", "client text");
      const serverOp = makeOp("string.set", "content", "server text");

      const result = unionPrimitive._internal.transformOperation(clientOp, serverOp);

      expect(result.type).toBe("transformed");
      if (result.type === "transformed") {
        expect(result.operation.payload).toBe("client text");
      }
    });

    it("should let client union.set win over server union.set", () => {
      const clientOp = makeOp("union.set", "", { type: "text", content: "client" });
      const serverOp = makeOp("union.set", "", { type: "number", value: 100 });

      const result = unionPrimitive._internal.transformOperation(clientOp, serverOp);

      expect(result.type).toBe("transformed");
      if (result.type === "transformed") {
        expect(result.operation.payload.type).toBe("text");
      }
    });
  });

  describe("LazyPrimitive", () => {
    const lazyPrimitive = Primitive.Lazy(() =>
      Primitive.Struct({
        name: Primitive.String(),
        count: Primitive.Number(),
      })
    );

    it("should delegate transformation to resolved primitive", () => {
      const clientOp = makeOp("string.set", "name", "Client");
      const serverOp = makeOp("string.set", "name", "Server");

      const result = lazyPrimitive._internal.transformOperation(clientOp, serverOp);

      expect(result.type).toBe("transformed");
      if (result.type === "transformed") {
        expect(result.operation.payload).toBe("Client");
      }
    });

    it("should pass through operations on different fields", () => {
      const clientOp = makeOp("string.set", "name", "Client");
      const serverOp = makeOp("number.set", "count", 100);

      const result = lazyPrimitive._internal.transformOperation(clientOp, serverOp);

      expect(result.type).toBe("transformed");
    });
  });

  describe("Nested Structures", () => {
    const nestedPrimitive = Primitive.Struct({
      user: Primitive.Struct({
        name: Primitive.String(),
        email: Primitive.String(),
      }),
      items: Primitive.Array(
        Primitive.Struct({
          title: Primitive.String(),
          done: Primitive.Boolean(),
        })
      ),
    });

    it("should pass through operations on different nested paths", () => {
      const clientOp = makeOp("string.set", "user/name", "John");
      const serverOp = makeOp("string.set", "user/email", "john@test.com");

      const result = nestedPrimitive._internal.transformOperation(clientOp, serverOp);

      expect(result.type).toBe("transformed");
    });

    it("should let client win for same nested path", () => {
      const clientOp = makeOp("string.set", "user/name", "Client Name");
      const serverOp = makeOp("string.set", "user/name", "Server Name");

      const result = nestedPrimitive._internal.transformOperation(clientOp, serverOp);

      expect(result.type).toBe("transformed");
      if (result.type === "transformed") {
        expect(result.operation.payload).toBe("Client Name");
      }
    });

    it("should noop when server removes array element that client is updating", () => {
      const clientOp = makeOp("string.set", "items/item-1/title", "Updated Title");
      const serverOp = makeOp("array.remove", "items", { id: "item-1" });

      const result = nestedPrimitive._internal.transformOperation(clientOp, serverOp);

      expect(result.type).toBe("noop");
    });

    it("should pass through array element update when server removes different element", () => {
      const clientOp = makeOp("string.set", "items/item-1/title", "Updated Title");
      const serverOp = makeOp("array.remove", "items", { id: "item-2" });

      const result = nestedPrimitive._internal.transformOperation(clientOp, serverOp);

      expect(result.type).toBe("transformed");
    });
  });
});

// =============================================================================
// TreeNode Primitive Tests
// =============================================================================

describe("TreeNodePrimitive", () => {
  it("creates a TreeNode with type, data, and empty children", () => {
    const FileNode = Primitive.TreeNode("file", {
      data: Primitive.Struct({ name: Primitive.String(), size: Primitive.Number() }),
      children: [],
    });

    expect(FileNode.type).toBe("file");
    expect(FileNode.data).toBeInstanceOf(Primitive.StructPrimitive);
    expect(FileNode.children).toEqual([]);
  });

  it("creates a TreeNode with lazy children for self-reference", () => {
    const FolderNode: Primitive.AnyTreeNodePrimitive = Primitive.TreeNode("folder", {
      data: Primitive.Struct({ name: Primitive.String() }),
      children: (): readonly Primitive.AnyTreeNodePrimitive[] => [FolderNode],
    });

    expect(FolderNode.type).toBe("folder");
    expect(FolderNode.children).toHaveLength(1);
    expect(FolderNode.children[0]).toBe(FolderNode);
  });

  it("isChildAllowed returns true for allowed child types", () => {
    const FileNode = Primitive.TreeNode("file", {
      data: Primitive.Struct({ name: Primitive.String() }),
      children: [],
    });

    const FolderNode: Primitive.AnyTreeNodePrimitive = Primitive.TreeNode("folder", {
      data: Primitive.Struct({ name: Primitive.String() }),
      children: (): readonly Primitive.AnyTreeNodePrimitive[] => [FolderNode, FileNode],
    });

    expect(FolderNode.isChildAllowed("folder")).toBe(true);
    expect(FolderNode.isChildAllowed("file")).toBe(true);
    expect(FolderNode.isChildAllowed("unknown")).toBe(false);
    expect(FileNode.isChildAllowed("file")).toBe(false);
  });
});

// =============================================================================
// Tree Primitive Tests
// =============================================================================

describe("TreePrimitive", () => {
  // Define node types using the new TreeNode API
  const FileNode = Primitive.TreeNode("file", {
    data: Primitive.Struct({ name: Primitive.String(), size: Primitive.Number() }),
    children: [] as const,
  });

  const FolderNode = Primitive.TreeNode("folder", {
    data: Primitive.Struct({ name: Primitive.String() }),
    children: (): readonly Primitive.AnyTreeNodePrimitive[] => [FolderNode, FileNode],
  });

  const fileSystemTree = Primitive.Tree({
    root: FolderNode,
  });

  // Helper to create a mock environment with state access
  const createEnvWithState = (
    state: Primitive.TreeState<typeof FolderNode> = []
  ): { env: ReturnType<typeof ProxyEnvironment.make>; operations: Operation.Operation<any, any, any>[] } => {
    const operations: Operation.Operation<any, any, any>[] = [];
    let currentState = [...state] as Primitive.TreeState<typeof FolderNode>;
    let idCounter = 0;

    const env = ProxyEnvironment.make({
      onOperation: (op) => {
        operations.push(op);
        // Apply operation to keep state in sync
        currentState = fileSystemTree._internal.applyOperation(currentState, op);
      },
      getState: () => currentState,
      generateId: () => `node-${++idCounter}`,
    });

    return { env, operations };
  };

  describe("schema", () => {
    it("exposes root node type", () => {
      expect(fileSystemTree.root).toBe(FolderNode);
      expect(fileSystemTree.root.type).toBe("folder");
    });

    it("required() returns a new TreePrimitive", () => {
      const required = fileSystemTree.required();
      expect(required).toBeInstanceOf(Primitive.TreePrimitive);
      expect(required).not.toBe(fileSystemTree);
    });

    it("default() returns a new TreePrimitive with default value", () => {
      const defaultState: Primitive.TreeState<typeof FolderNode> = [
        { id: "root", type: "folder", parentId: null, pos: "a0", data: { name: "Root" } },
      ];
      const withDefault = fileSystemTree.default(defaultState);
      expect(withDefault._internal.getInitialState()).toEqual(defaultState);
    });
  });

  describe("proxy - basic operations", () => {
    it("get() returns empty array for initial state", () => {
      const { env } = createEnvWithState();
      const proxy = fileSystemTree._internal.createProxy(env, OperationPath.make(""));

      expect(proxy.get()).toEqual([]);
    });

    it("set() generates tree.set operation", () => {
      const { env, operations } = createEnvWithState();
      const proxy = fileSystemTree._internal.createProxy(env, OperationPath.make(""));

      const nodes: Primitive.TreeState<typeof FolderNode> = [
        { id: "root", type: "folder", parentId: null, pos: "a0", data: { name: "Root" } },
      ];
      proxy.set(nodes);

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("tree.set");
      expect(operations[0]!.payload).toEqual(nodes);
    });

    it("root() returns the root node", () => {
      const initialState: Primitive.TreeState<typeof FolderNode> = [
        { id: "root", type: "folder", parentId: null, pos: "a0", data: { name: "Root" } },
        { id: "child1", type: "file", parentId: "root", pos: "a0", data: { name: "File1", size: 100 } },
      ];
      const { env } = createEnvWithState(initialState);
      const proxy = fileSystemTree._internal.createProxy(env, OperationPath.make(""));

      const root = proxy.root();
      expect(root).toBeDefined();
      expect(root!.id).toBe("root");
      expect(root!.parentId).toBe(null);
    });

    it("node() returns a node proxy by ID", () => {
      const initialState: Primitive.TreeState<typeof FolderNode> = [
        { id: "root", type: "folder", parentId: null, pos: "a0", data: { name: "Root" } },
        { id: "child1", type: "file", parentId: "root", pos: "a0", data: { name: "File1", size: 100 } },
      ];
      const { env } = createEnvWithState(initialState);
      const proxy = fileSystemTree._internal.createProxy(env, OperationPath.make(""));

      const node = proxy.node("child1");
      expect(node).toBeDefined();
      expect(node!.id).toBe("child1");
      expect(node!.type).toBe("file");
      expect(node!.get().data).toEqual({ name: "File1", size: 100 });
    });

    it("children() returns ordered children", () => {
      const initialState: Primitive.TreeState<typeof FolderNode> = [
        { id: "root", type: "folder", parentId: null, pos: "a0", data: { name: "Root" } },
        { id: "child2", type: "file", parentId: "root", pos: "a1", data: { name: "File2", size: 200 } },
        { id: "child1", type: "file", parentId: "root", pos: "a0", data: { name: "File1", size: 100 } },
      ];
      const { env } = createEnvWithState(initialState);
      const proxy = fileSystemTree._internal.createProxy(env, OperationPath.make(""));

      const children = proxy.children("root");
      expect(children).toHaveLength(2);
      expect(children[0]!.id).toBe("child1"); // a0 comes first
      expect(children[1]!.id).toBe("child2"); // a1 comes second
    });
  });

  describe("proxy - type narrowing with is() and as()", () => {
    it("is() returns true for matching node type", () => {
      const initialState: Primitive.TreeState<typeof FolderNode> = [
        { id: "root", type: "folder", parentId: null, pos: "a0", data: { name: "Root" } },
        { id: "file1", type: "file", parentId: "root", pos: "a0", data: { name: "File1", size: 100 } },
      ];
      const { env } = createEnvWithState(initialState);
      const proxy = fileSystemTree._internal.createProxy(env, OperationPath.make(""));

      const fileProxy = proxy.node("file1");
      expect(fileProxy!.is(FileNode)).toBe(true);
      expect(fileProxy!.is(FolderNode)).toBe(false);

      const folderProxy = proxy.node("root");
      expect(folderProxy!.is(FolderNode)).toBe(true);
      expect(folderProxy!.is(FileNode)).toBe(false);
    });

    it("as() returns typed proxy for correct type", () => {
      const initialState: Primitive.TreeState<typeof FolderNode> = [
        { id: "root", type: "folder", parentId: null, pos: "a0", data: { name: "Root" } },
        { id: "file1", type: "file", parentId: "root", pos: "a0", data: { name: "File1", size: 100 } },
      ];
      const { env, operations } = createEnvWithState(initialState);
      const proxy = fileSystemTree._internal.createProxy(env, OperationPath.make(""));

      const fileProxy = proxy.node("file1")!.as(FileNode);
      expect(fileProxy.id).toBe("file1");
      expect(fileProxy.type).toBe("file");

      // Type-safe data access
      fileProxy.data.name.set("UpdatedName");
      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("string.set");
    });

    it("as() throws for wrong type", () => {
      const initialState: Primitive.TreeState<typeof FolderNode> = [
        { id: "file1", type: "file", parentId: null, pos: "a0", data: { name: "File1", size: 100 } },
      ];
      const { env } = createEnvWithState(initialState);
      const proxy = fileSystemTree._internal.createProxy(env, OperationPath.make(""));

      const nodeProxy = proxy.node("file1");
      expect(() => nodeProxy!.as(FolderNode)).toThrow(Primitive.ValidationError);
    });
  });

  describe("proxy - insert operations with TreeNode types", () => {
    it("insertFirst() creates node at beginning of children", () => {
      const initialState: Primitive.TreeState<typeof FolderNode> = [
        { id: "root", type: "folder", parentId: null, pos: "a0", data: { name: "Root" } },
        { id: "existing", type: "file", parentId: "root", pos: "a1", data: { name: "Existing", size: 100 } },
      ];
      const { env, operations } = createEnvWithState(initialState);
      const proxy = fileSystemTree._internal.createProxy(env, OperationPath.make(""));

      const newId = proxy.insertFirst("root", FileNode, { name: "First", size: 50 });

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("tree.insert");
      expect(newId).toBe("node-1");

      const payload = operations[0]!.payload as { id: string; pos: string; type: string };
      expect(payload.type).toBe("file");
      expect(payload.pos < "a1").toBe(true); // Should be before existing
    });

    it("insertLast() creates node at end of children", () => {
      const initialState: Primitive.TreeState<typeof FolderNode> = [
        { id: "root", type: "folder", parentId: null, pos: "a0", data: { name: "Root" } },
        { id: "existing", type: "file", parentId: "root", pos: "a0", data: { name: "Existing", size: 100 } },
      ];
      const { env, operations } = createEnvWithState(initialState);
      const proxy = fileSystemTree._internal.createProxy(env, OperationPath.make(""));

      proxy.insertLast("root", FileNode, { name: "Last", size: 50 });

      const payload = operations[0]!.payload as { pos: string };
      expect(payload.pos > "a0").toBe(true); // Should be after existing
    });

    it("insertFirst() with null parentId creates root node", () => {
      const { env, operations } = createEnvWithState();
      const proxy = fileSystemTree._internal.createProxy(env, OperationPath.make(""));

      proxy.insertFirst(null, FolderNode, { name: "Root" });

      expect(operations).toHaveLength(1);
      const payload = operations[0]!.payload as { parentId: string | null; type: string };
      expect(payload.parentId).toBe(null);
      expect(payload.type).toBe("folder");
    });
  });

  describe("proxy - validation", () => {
    it("throws when inserting invalid child type", () => {
      const initialState: Primitive.TreeState<typeof FolderNode> = [
        { id: "root", type: "folder", parentId: null, pos: "a0", data: { name: "Root" } },
        { id: "file1", type: "file", parentId: "root", pos: "a0", data: { name: "File1", size: 100 } },
      ];
      const { env } = createEnvWithState(initialState);
      const proxy = fileSystemTree._internal.createProxy(env, OperationPath.make(""));

      // Files cannot have children
      expect(() => proxy.insertFirst("file1", FileNode, { name: "Child", size: 50 })).toThrow(
        Primitive.ValidationError
      );
    });

    it("throws when inserting non-root type at root level", () => {
      const { env } = createEnvWithState();
      const proxy = fileSystemTree._internal.createProxy(env, OperationPath.make(""));

      expect(() => proxy.insertFirst(null, FileNode, { name: "File", size: 50 })).toThrow(
        Primitive.ValidationError
      );
    });

    it("throws when inserting second root", () => {
      const initialState: Primitive.TreeState<typeof FolderNode> = [
        { id: "root", type: "folder", parentId: null, pos: "a0", data: { name: "Root" } },
      ];
      const { env } = createEnvWithState(initialState);
      const proxy = fileSystemTree._internal.createProxy(env, OperationPath.make(""));

      expect(() => proxy.insertFirst(null, FolderNode, { name: "SecondRoot" })).toThrow(
        Primitive.ValidationError
      );
    });
  });

  describe("proxy - toSnapshot()", () => {
    it("returns undefined for empty tree", () => {
      const { env } = createEnvWithState();
      const proxy = fileSystemTree._internal.createProxy(env, OperationPath.make(""));

      expect(proxy.toSnapshot()).toBeUndefined();
    });

    it("returns nested snapshot with spread data", () => {
      const initialState: Primitive.TreeState<typeof FolderNode> = [
        { id: "root", type: "folder", parentId: null, pos: "a0", data: { name: "Root" } },
        { id: "file1", type: "file", parentId: "root", pos: "a0", data: { name: "File1", size: 100 } },
        { id: "folder1", type: "folder", parentId: "root", pos: "a1", data: { name: "Subfolder" } },
        { id: "file2", type: "file", parentId: "folder1", pos: "a0", data: { name: "File2", size: 200 } },
      ];
      const { env } = createEnvWithState(initialState);
      const proxy = fileSystemTree._internal.createProxy(env, OperationPath.make(""));

      const snapshot = proxy.toSnapshot();
      expect(snapshot).toBeDefined();
      expect(snapshot!.id).toBe("root");
      expect(snapshot!.type).toBe("folder");
      expect(snapshot!.name).toBe("Root"); // Data spread at node level
      expect(snapshot!.children).toHaveLength(2);

      const file1Snapshot = snapshot!.children[0]!;
      expect(file1Snapshot.id).toBe("file1");
      expect(file1Snapshot.name).toBe("File1");
      expect(file1Snapshot.children).toEqual([]);

      const folder1Snapshot = snapshot!.children[1]!;
      expect(folder1Snapshot.id).toBe("folder1");
      expect(folder1Snapshot.children).toHaveLength(1);
      expect(folder1Snapshot.children[0]!.name).toBe("File2");
    });
  });

  describe("proxy - at() with typed node", () => {
    it("at() returns typed proxy for node data", () => {
      const initialState: Primitive.TreeState<typeof FolderNode> = [
        { id: "root", type: "folder", parentId: null, pos: "a0", data: { name: "Root" } },
        { id: "file1", type: "file", parentId: "root", pos: "a0", data: { name: "File1", size: 100 } },
      ];
      const { env, operations } = createEnvWithState(initialState);
      const proxy = fileSystemTree._internal.createProxy(env, OperationPath.make(""));

      proxy.at("file1", FileNode).name.set("UpdatedName");

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("string.set");
      expect(operations[0]!.path.toTokens()).toEqual(["file1", "name"]);
      expect(operations[0]!.payload).toBe("UpdatedName");
    });

    it("at() throws when node type mismatch", () => {
      const initialState: Primitive.TreeState<typeof FolderNode> = [
        { id: "file1", type: "file", parentId: null, pos: "a0", data: { name: "File1", size: 100 } },
      ];
      const { env } = createEnvWithState(initialState);
      const proxy = fileSystemTree._internal.createProxy(env, OperationPath.make(""));

      expect(() => proxy.at("file1", FolderNode)).toThrow(Primitive.ValidationError);
    });
  });

  describe("proxy - move operations", () => {
    it("move() changes parent and position", () => {
      const initialState: Primitive.TreeState<typeof FolderNode> = [
        { id: "root", type: "folder", parentId: null, pos: "a0", data: { name: "Root" } },
        { id: "folder1", type: "folder", parentId: "root", pos: "a0", data: { name: "Folder1" } },
        { id: "folder2", type: "folder", parentId: "root", pos: "a1", data: { name: "Folder2" } },
        { id: "file1", type: "file", parentId: "folder1", pos: "a0", data: { name: "File1", size: 100 } },
      ];
      const { env, operations } = createEnvWithState(initialState);
      const proxy = fileSystemTree._internal.createProxy(env, OperationPath.make(""));

      // Move file1 to folder2
      proxy.move("file1", "folder2", 0);

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("tree.move");
      const payload = operations[0]!.payload as { id: string; parentId: string };
      expect(payload.id).toBe("file1");
      expect(payload.parentId).toBe("folder2");
    });

    it("throws when moving node to its descendant (cycle prevention)", () => {
      const initialState: Primitive.TreeState<typeof FolderNode> = [
        { id: "root", type: "folder", parentId: null, pos: "a0", data: { name: "Root" } },
        { id: "folder1", type: "folder", parentId: "root", pos: "a0", data: { name: "Folder1" } },
        { id: "folder2", type: "folder", parentId: "folder1", pos: "a0", data: { name: "Folder2" } },
      ];
      const { env } = createEnvWithState(initialState);
      const proxy = fileSystemTree._internal.createProxy(env, OperationPath.make(""));

      expect(() => proxy.move("folder1", "folder2", 0)).toThrow(Primitive.ValidationError);
    });
  });

  describe("applyOperation", () => {
    it("tree.set replaces entire tree", () => {
      const newNodes: Primitive.TreeState<typeof FolderNode> = [
        { id: "new-root", type: "folder", parentId: null, pos: "a0", data: { name: "NewRoot" } },
      ];
      const operation: Operation.Operation<any, any, any> = {
        kind: "tree.set",
        path: OperationPath.make(""),
        payload: newNodes,
      };

      const result = fileSystemTree._internal.applyOperation([], operation);
      expect(result).toEqual(newNodes);
    });

    it("tree.insert adds a new node", () => {
      const initialState: Primitive.TreeState<typeof FolderNode> = [
        { id: "root", type: "folder", parentId: null, pos: "a0", data: { name: "Root" } },
      ];
      const operation: Operation.Operation<any, any, any> = {
        kind: "tree.insert",
        path: OperationPath.make(""),
        payload: {
          id: "file1",
          type: "file",
          parentId: "root",
          pos: "a0",
          data: { name: "File1", size: 100 },
        },
      };

      const result = fileSystemTree._internal.applyOperation(initialState, operation);
      expect(result).toHaveLength(2);
      expect(result[1]).toEqual({
        id: "file1",
        type: "file",
        parentId: "root",
        pos: "a0",
        data: { name: "File1", size: 100 },
      });
    });

    it("tree.remove removes node and descendants", () => {
      const initialState: Primitive.TreeState<typeof FolderNode> = [
        { id: "root", type: "folder", parentId: null, pos: "a0", data: { name: "Root" } },
        { id: "folder1", type: "folder", parentId: "root", pos: "a0", data: { name: "Folder1" } },
        { id: "file1", type: "file", parentId: "folder1", pos: "a0", data: { name: "File1", size: 100 } },
        { id: "folder2", type: "folder", parentId: "root", pos: "a1", data: { name: "Folder2" } },
      ];
      const operation: Operation.Operation<any, any, any> = {
        kind: "tree.remove",
        path: OperationPath.make(""),
        payload: { id: "folder1" },
      };

      const result = fileSystemTree._internal.applyOperation(initialState, operation);
      expect(result).toHaveLength(2);
      expect(result.map(n => n.id)).toEqual(["root", "folder2"]);
    });

    it("delegates node data operations", () => {
      const initialState: Primitive.TreeState<typeof FolderNode> = [
        { id: "root", type: "folder", parentId: null, pos: "a0", data: { name: "Root" } },
        { id: "file1", type: "file", parentId: "root", pos: "a0", data: { name: "File1", size: 100 } },
      ];
      const operation: Operation.Operation<any, any, any> = {
        kind: "string.set",
        path: OperationPath.make("file1/name"),
        payload: "UpdatedName",
      };

      const result = fileSystemTree._internal.applyOperation(initialState, operation);
      const updatedNode = result.find(n => n.id === "file1");
      expect(updatedNode!.data).toEqual({ name: "UpdatedName", size: 100 });
    });
  });

  describe("getInitialState", () => {
    it("automatically creates a root node when no default is set", () => {
      const initialState = fileSystemTree._internal.getInitialState();
      expect(initialState).toBeDefined();
      expect(initialState).toHaveLength(1);
      expect(initialState![0]).toMatchObject({
        type: "folder",
        parentId: null,
        data: {},
      });
      // Verify ID and pos are generated
      expect(typeof initialState![0]!.id).toBe("string");
      expect(typeof initialState![0]!.pos).toBe("string");
    });

    it("returns the default value when set", () => {
      const defaultState: Primitive.TreeState<typeof FolderNode> = [
        { id: "root", type: "folder", parentId: null, pos: "a0", data: { name: "Root" } },
      ];
      const withDefault = fileSystemTree.default(defaultState);
      expect(withDefault._internal.getInitialState()).toEqual(defaultState);
    });
  });
});

// =============================================================================
// Integration Tests - Tree with Complex Structures
// =============================================================================

describe("Integration - Tree with Complex Structures", () => {
  it("supports deeply nested file system", () => {
    const FileNode = Primitive.TreeNode("file", {
      data: Primitive.Struct({ name: Primitive.String(), content: Primitive.String() }),
      children: [] as const,
    });

    const FolderNode: Primitive.AnyTreeNodePrimitive = Primitive.TreeNode("folder", {
      data: Primitive.Struct({ name: Primitive.String() }),
      children: (): readonly Primitive.AnyTreeNodePrimitive[] => [FolderNode, FileNode],
    });

    const fileSystemTree = Primitive.Tree({ root: FolderNode });

    const operations: Operation.Operation<any, any, any>[] = [];
    let currentState: Primitive.TreeState<typeof FolderNode> = [];
    let idCounter = 0;

    const env = ProxyEnvironment.make({
      onOperation: (op) => {
        operations.push(op);
        currentState = fileSystemTree._internal.applyOperation(currentState, op);
      },
      getState: () => currentState,
      generateId: () => `node-${++idCounter}`,
    });

    const proxy = fileSystemTree._internal.createProxy(env, OperationPath.make(""));

    // Create root folder
    const rootId = proxy.insertFirst(null, FolderNode, { name: "root" });

    // Create nested structure
    const docsId = proxy.insertLast(rootId, FolderNode, { name: "docs" });
    const srcId = proxy.insertLast(rootId, FolderNode, { name: "src" });

    proxy.insertLast(docsId, FileNode, { name: "README.md", content: "# Hello" });
    proxy.insertLast(srcId, FolderNode, { name: "components" });

    expect(currentState).toHaveLength(5);

    // Verify structure via snapshot
    const snapshot = proxy.toSnapshot();
    expect(snapshot).toBeDefined();
    expect(snapshot!.name).toBe("root");
    expect(snapshot!.children).toHaveLength(2);
  });

  it("maintains order when inserting multiple siblings", () => {
    const NodeType: Primitive.AnyTreeNodePrimitive = Primitive.TreeNode("node", {
      data: Primitive.Struct({ label: Primitive.String() }),
      children: (): readonly Primitive.AnyTreeNodePrimitive[] => [NodeType],
    });

    const tree = Primitive.Tree({ root: NodeType });

    const operations: Operation.Operation<any, any, any>[] = [];
    let currentState: Primitive.TreeState<typeof NodeType> = [];
    let idCounter = 0;

    const env = ProxyEnvironment.make({
      onOperation: (op) => {
        operations.push(op);
        currentState = tree._internal.applyOperation(currentState, op);
      },
      getState: () => currentState,
      generateId: () => `node-${++idCounter}`,
    });

    const proxy = tree._internal.createProxy(env, OperationPath.make(""));

    // Create root and multiple children
    const rootId = proxy.insertFirst(null, NodeType, { label: "root" });
    proxy.insertLast(rootId, NodeType, { label: "A" });
    proxy.insertLast(rootId, NodeType, { label: "B" });
    proxy.insertLast(rootId, NodeType, { label: "C" });

    // Insert between A and B
    const children = proxy.children(rootId);
    expect(children.map(c => (c.data as { label: string }).label)).toEqual(["A", "B", "C"]);

    // Insert D after A
    proxy.insertAfter(children[0]!.id, NodeType, { label: "D" });

    const updatedChildren = proxy.children(rootId);
    expect(updatedChildren.map(c => (c.data as { label: string }).label)).toEqual(["A", "D", "B", "C"]);
  });
});

// =============================================================================
// toSnapshot Tests
// =============================================================================

describe("toSnapshot", () => {
  describe("StringPrimitive", () => {
    it("returns the state value when defined", () => {
      const state: Record<string, unknown> = { name: "test" };
      const env = ProxyEnvironment.make({
        onOperation: () => {},
        getState: (path) => {
          const tokens = path.toTokens().filter(t => t !== "");
          if (tokens.length === 0) return state;
          return state[tokens[0]!];
        },
      });

      const stringPrimitive = Primitive.String();
      const proxy = stringPrimitive._internal.createProxy(env, OperationPath.make("name"));

      expect(proxy.toSnapshot()).toBe("test");
    });

    it("returns undefined when state is undefined and no default", () => {
      const env = ProxyEnvironment.make({
        onOperation: () => {},
        getState: () => undefined,
      });

      const stringPrimitive = Primitive.String();
      const proxy = stringPrimitive._internal.createProxy(env, OperationPath.make(""));

      expect(proxy.toSnapshot()).toBeUndefined();
    });

    it("returns default value when state is undefined", () => {
      const env = ProxyEnvironment.make({
        onOperation: () => {},
        getState: () => undefined,
      });

      const stringPrimitive = Primitive.String().default("default value");
      const proxy = stringPrimitive._internal.createProxy(env, OperationPath.make(""));

      expect(proxy.toSnapshot()).toBe("default value");
    });

    it("returns state value over default when both exist", () => {
      const env = ProxyEnvironment.make({
        onOperation: () => {},
        getState: () => "actual value",
      });

      const stringPrimitive = Primitive.String().default("default value");
      const proxy = stringPrimitive._internal.createProxy(env, OperationPath.make(""));

      expect(proxy.toSnapshot()).toBe("actual value");
    });
  });

  describe("NumberPrimitive", () => {
    it("returns default value when state is undefined", () => {
      const env = ProxyEnvironment.make({
        onOperation: () => {},
        getState: () => undefined,
      });

      const numberPrimitive = Primitive.Number().default(42);
      const proxy = numberPrimitive._internal.createProxy(env, OperationPath.make(""));

      expect(proxy.toSnapshot()).toBe(42);
    });

    it("returns 0 as default (falsy default value)", () => {
      const env = ProxyEnvironment.make({
        onOperation: () => {},
        getState: () => undefined,
      });

      const numberPrimitive = Primitive.Number().default(0);
      const proxy = numberPrimitive._internal.createProxy(env, OperationPath.make(""));

      expect(proxy.toSnapshot()).toBe(0);
    });
  });

  describe("BooleanPrimitive", () => {
    it("returns default value when state is undefined", () => {
      const env = ProxyEnvironment.make({
        onOperation: () => {},
        getState: () => undefined,
      });

      const booleanPrimitive = Primitive.Boolean().default(true);
      const proxy = booleanPrimitive._internal.createProxy(env, OperationPath.make(""));

      expect(proxy.toSnapshot()).toBe(true);
    });

    it("returns false as default (falsy default value)", () => {
      const env = ProxyEnvironment.make({
        onOperation: () => {},
        getState: () => undefined,
      });

      const booleanPrimitive = Primitive.Boolean().default(false);
      const proxy = booleanPrimitive._internal.createProxy(env, OperationPath.make(""));

      expect(proxy.toSnapshot()).toBe(false);
    });
  });

  describe("StructPrimitive", () => {
    it("returns snapshot with all field snapshots", () => {
      const state = {
        name: "John",
        age: 30,
      };
      const env = ProxyEnvironment.make({
        onOperation: () => {},
        getState: (path) => {
          const tokens = path.toTokens().filter(t => t !== "");
          if (tokens.length === 0) return state;
          let current: unknown = state;
          for (const token of tokens) {
            current = (current as Record<string, unknown>)[token];
          }
          return current;
        },
      });

      const schema = Primitive.Struct({
        name: Primitive.String(),
        age: Primitive.Number(),
      });
      const proxy = schema._internal.createProxy(env, OperationPath.make(""));

      const snapshot = proxy.toSnapshot();

      expect(snapshot).toEqual({
        name: "John",
        age: 30,
      });
    });

    it("respects field defaults in snapshot", () => {
      const env = ProxyEnvironment.make({
        onOperation: () => {},
        getState: () => undefined,
      });

      const schema = Primitive.Struct({
        name: Primitive.String().default("Unknown"),
        count: Primitive.Number().default(0),
      });
      const proxy = schema._internal.createProxy(env, OperationPath.make(""));

      const snapshot = proxy.toSnapshot();

      expect(snapshot).toEqual({
        name: "Unknown",
        count: 0,
      });
    });

    it("returns undefined for struct without state or default", () => {
      const env = ProxyEnvironment.make({
        onOperation: () => {},
        getState: () => undefined,
      });

      const schema = Primitive.Struct({
        name: Primitive.String(),
        age: Primitive.Number(),
      });
      const proxy = schema._internal.createProxy(env, OperationPath.make(""));

      expect(proxy.toSnapshot()).toBeUndefined();
    });
  });

  describe("ArrayPrimitive", () => {
    it("returns empty array when state is undefined", () => {
      const env = ProxyEnvironment.make({
        onOperation: () => {},
        getState: () => undefined,
      });

      const schema = Primitive.Array(Primitive.String());
      const proxy = schema._internal.createProxy(env, OperationPath.make(""));

      expect(proxy.toSnapshot()).toEqual([]);
    });

    it("returns array entries with id and value snapshot", () => {
      const state = [
        { id: "1", pos: "a", value: "first" },
        { id: "2", pos: "b", value: "second" },
      ];
      const env = ProxyEnvironment.make({
        onOperation: () => {},
        getState: (path) => {
          const tokens = path.toTokens().filter(t => t !== "");
          if (tokens.length === 0) return state;
          // For element access by ID
          if (tokens.length >= 1) {
            const entry = state.find(e => e.id === tokens[0]);
            return entry?.value;
          }
          return undefined;
        },
      });

      const schema = Primitive.Array(Primitive.String());
      const proxy = schema._internal.createProxy(env, OperationPath.make(""));

      const snapshot = proxy.toSnapshot();

      expect(snapshot).toEqual([
        { id: "1", value: "first" },
        { id: "2", value: "second" },
      ]);
    });

    it("returns element snapshots with defaults applied", () => {
      const state = [
        { id: "1", pos: "a", value: undefined },
      ];
      const env = ProxyEnvironment.make({
        onOperation: () => {},
        getState: (path) => {
          const tokens = path.toTokens().filter(t => t !== "");
          if (tokens.length === 0) return state;
          if (tokens.length >= 1) {
            const entry = state.find(e => e.id === tokens[0]);
            return entry?.value;
          }
          return undefined;
        },
      });

      const schema = Primitive.Array(Primitive.String().default("default"));
      const proxy = schema._internal.createProxy(env, OperationPath.make(""));

      const snapshot = proxy.toSnapshot();

      expect(snapshot).toEqual([
        { id: "1", value: "default" },
      ]);
    });

    it("handles nested struct elements", () => {
      const state = [
        { id: "1", pos: "a", value: { title: "First", count: 10 } },
        { id: "2", pos: "b", value: { title: "Second", count: 20 } },
      ];
      const env = ProxyEnvironment.make({
        onOperation: () => {},
        getState: (path) => {
          const tokens = path.toTokens().filter(t => t !== "");
          if (tokens.length === 0) return state;
          if (tokens.length >= 1) {
            const entry = state.find(e => e.id === tokens[0]);
            if (!entry) return undefined;
            if (tokens.length === 1) return entry.value;
            let current: unknown = entry.value;
            for (let i = 1; i < tokens.length; i++) {
              current = (current as Record<string, unknown>)[tokens[i]!];
            }
            return current;
          }
          return undefined;
        },
      });

      const schema = Primitive.Array(
        Primitive.Struct({
          title: Primitive.String(),
          count: Primitive.Number(),
        })
      );
      const proxy = schema._internal.createProxy(env, OperationPath.make(""));

      const snapshot = proxy.toSnapshot();

      expect(snapshot).toEqual([
        { id: "1", value: { title: "First", count: 10 } },
        { id: "2", value: { title: "Second", count: 20 } },
      ]);
    });
  });

  describe("UnionPrimitive", () => {
    it("returns snapshot of active variant", () => {
      const state = { type: "person", name: "John" };
      const env = ProxyEnvironment.make({
        onOperation: () => {},
        getState: (path) => {
          const tokens = path.toTokens().filter(t => t !== "");
          if (tokens.length === 0) return state;
          let current: unknown = state;
          for (const token of tokens) {
            current = (current as Record<string, unknown>)[token];
          }
          return current;
        },
      });

      const schema = Primitive.Union({
        variants: {
          person: Primitive.Struct({
            type: Primitive.Literal("person"),
            name: Primitive.String(),
          }),
          company: Primitive.Struct({
            type: Primitive.Literal("company"),
            companyName: Primitive.String(),
          }),
        },
      });
      const proxy = schema._internal.createProxy(env, OperationPath.make(""));

      const snapshot = proxy.toSnapshot();

      expect(snapshot).toEqual({ type: "person", name: "John" });
    });

    it("returns undefined when no state and no default", () => {
      const env = ProxyEnvironment.make({
        onOperation: () => {},
        getState: () => undefined,
      });

      const schema = Primitive.Union({
        variants: {
          person: Primitive.Struct({
            type: Primitive.Literal("person"),
            name: Primitive.String(),
          }),
        },
      });
      const proxy = schema._internal.createProxy(env, OperationPath.make(""));

      expect(proxy.toSnapshot()).toBeUndefined();
    });
  });

  describe("Type inference (compile-time checks)", () => {
    it("TDefined=true means no undefined in type", () => {
      // This test verifies that the types work correctly at compile time
      const requiredString = Primitive.String().required();
      const defaultString = Primitive.String().default("test");
      const optionalString = Primitive.String();

      // Type checks - these should compile without errors
      const _check1: Primitive.InferSnapshot<typeof requiredString> = "hello";
      const _check2: Primitive.InferSnapshot<typeof defaultString> = "hello";
      // @ts-expect-error - optionalString can be undefined
      const _check3: string = undefined as Primitive.InferSnapshot<typeof optionalString>;

      // Runtime check just to ensure the test runs
      expect(true).toBe(true);
    });

    it("struct snapshot includes field snapshots", () => {
      const schema = Primitive.Struct({
        name: Primitive.String().required(),
        age: Primitive.Number().default(0),
        nickname: Primitive.String(),
      }).required();

      // Type checks
      type Snapshot = Primitive.InferSnapshot<typeof schema>;
      const _check: Snapshot = {
        name: "John",
        age: 30,
        nickname: undefined,
      };

      expect(true).toBe(true);
    });

    it("array snapshot is always an array", () => {
      const schema = Primitive.Array(Primitive.String());

      // Type check - arrays always return an array, never undefined
      type Snapshot = Primitive.InferSnapshot<typeof schema>;
      const _check: Snapshot = [];

      expect(true).toBe(true);
    });
  });
});
