import { describe, expect, it } from "@effect/vitest";
import * as Primitive from "../../src/Primitive";
import * as ProxyEnvironment from "../../src/ProxyEnvironment";
import * as OperationPath from "../../src/OperationPath";
import * as Operation from "../../src/Operation";

const hasOwn = (value: unknown, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(value, key);

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

    it("set() only requires fields that are required and without defaults", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => {
        operations.push(op);
      });

      const structPrimitive = Primitive.Struct({
        name: Primitive.String().required().default("John Doe"),
        age: Primitive.Number().required(),
        email: Primitive.String(),
      });

      const proxy = structPrimitive._internal.createProxy(env, OperationPath.make(""));
      proxy.set({ age: 30 });

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("struct.set");
      expect(operations[0]!.payload).toEqual({ name: "John Doe", age: 30 });
      expect(hasOwn(operations[0]!.payload, "email")).toBe(false);
    });

    it("set() only requires fields that are required and without defaults", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => {
        operations.push(op);
      });

      const structPrimitive = Primitive.Struct({
        name: Primitive.String().required().default("John Doe"),
        age: Primitive.Number().required(),
        email: Primitive.String(),
      }).default({ age: 30 });

      const proxy = structPrimitive._internal.createProxy(env, OperationPath.make(""));
      proxy.set({ age: 30 });

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("struct.set");
      expect(operations[0]!.payload).toEqual({ name: "John Doe", age: 30 });
      expect(hasOwn(operations[0]!.payload, "email")).toBe(false);
    });

    it("set() prunes optional keys explicitly set to undefined", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => {
        operations.push(op);
      });

      const structPrimitive = Primitive.Struct({
        name: Primitive.String().required(),
        email: Primitive.String(),
      });

      const proxy = structPrimitive._internal.createProxy(env, OperationPath.make(""));
      proxy.set({ name: "Alice", email: undefined });

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("struct.set");
      expect(operations[0]!.payload).toEqual({ name: "Alice" });
      expect(hasOwn(operations[0]!.payload, "email")).toBe(false);
    });

    it("set() prunes optional keys explicitly set to null", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => {
        operations.push(op);
      });

      const structPrimitive = Primitive.Struct({
        name: Primitive.String().required(),
        email: Primitive.String(),
      });

      const proxy = structPrimitive._internal.createProxy(env, OperationPath.make(""));
      (proxy as any).set({ name: "Alice", email: null });

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("struct.set");
      expect(operations[0]!.payload).toEqual({ name: "Alice" });
      expect(hasOwn(operations[0]!.payload, "email")).toBe(false);
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

  describe("update", () => {
    it("update() generates individual field operations", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => {
        operations.push(op);
      });

      const structPrimitive = Primitive.Struct({
        name: Primitive.String(),
        email: Primitive.String(),
      });

      const proxy = structPrimitive._internal.createProxy(env, OperationPath.make(""));

      proxy.update({ name: "John" });

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("string.set");
      expect(operations[0]!.payload).toBe("John");
      expect(operations[0]!.path.toTokens()).toEqual(["name"]);
    });

    it("update() with multiple fields generates multiple operations", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => {
        operations.push(op);
      });

      const structPrimitive = Primitive.Struct({
        firstName: Primitive.String(),
        lastName: Primitive.String(),
        email: Primitive.String(),
      });

      const proxy = structPrimitive._internal.createProxy(env, OperationPath.make(""));

      proxy.update({ firstName: "John", lastName: "Doe" });

      expect(operations).toHaveLength(2);
      expect(operations.map((op) => op.payload)).toContain("John");
      expect(operations.map((op) => op.payload)).toContain("Doe");
    });

    it("update() emits struct.unset for undefined optional values", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => {
        operations.push(op);
      });

      const structPrimitive = Primitive.Struct({
        name: Primitive.String(),
        email: Primitive.String(),
      });

      const proxy = structPrimitive._internal.createProxy(env, OperationPath.make(""));

      proxy.update({ name: "John", email: undefined });

      expect(operations).toHaveLength(2);
      const nameOp = operations.find((op) => op.path.toTokens().join("/") === "name");
      const unsetOp = operations.find((op) => op.path.toTokens().join("/") === "email");
      expect(nameOp!.kind).toBe("string.set");
      expect(nameOp!.payload).toBe("John");
      expect(unsetOp!.kind).toBe("struct.unset");
    });

    it("update() removes existing optional key for undefined value", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const structPrimitive = Primitive.Struct({
        name: Primitive.String(),
        email: Primitive.String(),
      });
      let state: Primitive.InferState<typeof structPrimitive> | undefined = {
        name: "John",
        email: "john@example.com",
      };

      const env = ProxyEnvironment.make({
        onOperation: (op) => {
          operations.push(op);
          state = structPrimitive._internal.applyOperation(state, op);
        },
        getState: () => state,
      });

      const proxy = structPrimitive._internal.createProxy(env, OperationPath.make(""));
      proxy.update({ email: undefined });

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("struct.unset");
      expect(state).toEqual({ name: "John" });
      expect(hasOwn(state, "email")).toBe(false);
    });

    it("update() removes existing optional key for null value", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const structPrimitive = Primitive.Struct({
        name: Primitive.String(),
        email: Primitive.String(),
      });
      let state: Primitive.InferState<typeof structPrimitive> | undefined = {
        name: "John",
        email: "john@example.com",
      };

      const env = ProxyEnvironment.make({
        onOperation: (op) => {
          operations.push(op);
          state = structPrimitive._internal.applyOperation(state, op);
        },
        getState: () => state,
      });

      const proxy = structPrimitive._internal.createProxy(env, OperationPath.make(""));
      (proxy as any).update({ email: null });

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("struct.unset");
      expect(state).toEqual({ name: "John" });
      expect(hasOwn(state, "email")).toBe(false);
    });

    it("update() throws for undefined on required fields without defaults", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => {
        operations.push(op);
      });

      const structPrimitive = Primitive.Struct({
        name: Primitive.String().required(),
      });

      const proxy = structPrimitive._internal.createProxy(env, OperationPath.make(""));

      expect(() => proxy.update({ name: undefined as never })).toThrow(Primitive.ValidationError);
      expect(operations).toHaveLength(0);
    });

    it("update() throws for null on required fields without defaults", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => {
        operations.push(op);
      });

      const structPrimitive = Primitive.Struct({
        name: Primitive.String().required(),
      });

      const proxy = structPrimitive._internal.createProxy(env, OperationPath.make(""));

      expect(() => (proxy as any).update({ name: null })).toThrow(Primitive.ValidationError);
      expect(operations).toHaveLength(0);
    });

    it("update() recursively updates nested structs", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => {
        operations.push(op);
      });

      const addressPrimitive = Primitive.Struct({
        street: Primitive.String(),
        city: Primitive.String(),
        zip: Primitive.String(),
      });

      const personPrimitive = Primitive.Struct({
        name: Primitive.String(),
        address: addressPrimitive,
      });

      const proxy = personPrimitive._internal.createProxy(env, OperationPath.make(""));

      // Partial update of nested struct - only city should be updated
      proxy.update({ address: { city: "New York" } });

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("string.set");
      expect(operations[0]!.payload).toBe("New York");
      expect(operations[0]!.path.toTokens()).toEqual(["address", "city"]);
    });

    it("update() handles deeply nested structs", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => {
        operations.push(op);
      });

      const coordsPrimitive = Primitive.Struct({
        lat: Primitive.String(),
        lng: Primitive.String(),
      });

      const locationPrimitive = Primitive.Struct({
        name: Primitive.String(),
        coords: coordsPrimitive,
      });

      const personPrimitive = Primitive.Struct({
        name: Primitive.String(),
        location: locationPrimitive,
      });

      const proxy = personPrimitive._internal.createProxy(env, OperationPath.make(""));

      proxy.update({ location: { coords: { lat: "40.7128" } } });

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("string.set");
      expect(operations[0]!.payload).toBe("40.7128");
      expect(operations[0]!.path.toTokens()).toEqual(["location", "coords", "lat"]);
    });

    it("update() can update both nested and top-level fields", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => {
        operations.push(op);
      });

      const addressPrimitive = Primitive.Struct({
        city: Primitive.String(),
        zip: Primitive.String(),
      });

      const personPrimitive = Primitive.Struct({
        name: Primitive.String(),
        address: addressPrimitive,
      });

      const proxy = personPrimitive._internal.createProxy(env, OperationPath.make(""));

      proxy.update({ name: "Jane", address: { city: "Boston" } });

      expect(operations).toHaveLength(2);

      const nameOp = operations.find((op) => op.path.toTokens().join("/") === "name");
      const cityOp = operations.find((op) => op.path.toTokens().join("/") === "address/city");

      expect(nameOp).toBeDefined();
      expect(nameOp!.payload).toBe("Jane");

      expect(cityOp).toBeDefined();
      expect(cityOp!.payload).toBe("Boston");
    });

    it("update() with empty object generates no operations", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => {
        operations.push(op);
      });

      const structPrimitive = Primitive.Struct({
        name: Primitive.String(),
        email: Primitive.String(),
      });

      const proxy = structPrimitive._internal.createProxy(env, OperationPath.make(""));

      proxy.update({});

      expect(operations).toHaveLength(0);
    });

    it("update() ignores unknown fields", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => {
        operations.push(op);
      });

      const structPrimitive = Primitive.Struct({
        name: Primitive.String(),
      });

      const proxy = structPrimitive._internal.createProxy(env, OperationPath.make(""));

      // Cast to any to bypass type checking for testing unknown fields
      (proxy as any).update({ name: "John", unknownField: "value" });

      expect(operations).toHaveLength(1);
      expect(operations[0]!.payload).toBe("John");
    });

    it("update() with nested path prefix", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => {
        operations.push(op);
      });

      const structPrimitive = Primitive.Struct({
        name: Primitive.String(),
        email: Primitive.String(),
      });

      const proxy = structPrimitive._internal.createProxy(env, OperationPath.make("users/0"));

      proxy.update({ name: "Updated" });

      expect(operations).toHaveLength(1);
      expect(operations[0]!.path.toTokens()).toEqual(["users", "0", "name"]);
    });
  });
  describe("extend", () => {
    it("extends struct with additional fields", () => {
      const basePrimitive = Primitive.Struct({
        name: Primitive.String().required(),
      });

      const extendedPrimitive = basePrimitive.extend({
        email: Primitive.String().required(),
        age: Primitive.Number(),
      });

      // Verify fields exist
      expect(extendedPrimitive.fields).toHaveProperty("name");
      expect(extendedPrimitive.fields).toHaveProperty("email");
      expect(extendedPrimitive.fields).toHaveProperty("age");
    });

    it("extended struct generates correct operations", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => {
        operations.push(op);
      });

      const basePrimitive = Primitive.Struct({
        name: Primitive.String(),
      });

      const extendedPrimitive = basePrimitive.extend({
        email: Primitive.String(),
      });

      const proxy = extendedPrimitive._internal.createProxy(env, OperationPath.make(""));

      proxy.name.set("John");
      proxy.email.set("john@example.com");

      expect(operations).toHaveLength(2);
      expect(operations[0]!.kind).toBe("string.set");
      expect(operations[0]!.payload).toBe("John");
      expect(operations[0]!.path.toTokens()).toEqual(["name"]);
      expect(operations[1]!.kind).toBe("string.set");
      expect(operations[1]!.payload).toBe("john@example.com");
      expect(operations[1]!.path.toTokens()).toEqual(["email"]);
    });

    it("extended struct set() works with all fields", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => {
        operations.push(op);
      });

      const basePrimitive = Primitive.Struct({
        name: Primitive.String(),
      });

      const extendedPrimitive = basePrimitive.extend({
        email: Primitive.String(),
      });

      const proxy = extendedPrimitive._internal.createProxy(env, OperationPath.make(""));

      proxy.set({ name: "John", email: "john@example.com" });

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("struct.set");
      expect(operations[0]!.payload).toEqual({ name: "John", email: "john@example.com" });
    });

    it("extended struct preserves required status", () => {
      const basePrimitive = Primitive.Struct({
        name: Primitive.String(),
      }).required();

      const extendedPrimitive = basePrimitive.extend({
        email: Primitive.String(),
      });

      // The extended struct should still be required - verify via type system
      // Compile-time check: if the type doesn't match, this would be a type error
      type ExtendedTRequired = typeof extendedPrimitive._TRequired;
      const _typeCheck: ExtendedTRequired = true as const;
      expect(_typeCheck).toBe(true);
    });

    it("extended struct applyOperation works for both base and new fields", () => {
      const basePrimitive = Primitive.Struct({
        name: Primitive.String(),
      });

      const extendedPrimitive = basePrimitive.extend({
        email: Primitive.String(),
      });

      const nameOperation: Operation.Operation<any, any, any> = {
        kind: "string.set",
        path: OperationPath.make("name"),
        payload: "John",
      };

      const emailOperation: Operation.Operation<any, any, any> = {
        kind: "string.set",
        path: OperationPath.make("email"),
        payload: "john@example.com",
      };

      let state = extendedPrimitive._internal.applyOperation(undefined, nameOperation);
      state = extendedPrimitive._internal.applyOperation(state, emailOperation);

      expect(state).toEqual({ name: "John", email: "john@example.com" });
    });

    it("can chain multiple extend calls", () => {
      const basePrimitive = Primitive.Struct({
        id: Primitive.String(),
      });

      const extendedOnce = basePrimitive.extend({
        name: Primitive.String(),
      });

      const extendedTwice = extendedOnce.extend({
        email: Primitive.String(),
      });

      expect(extendedTwice.fields).toHaveProperty("id");
      expect(extendedTwice.fields).toHaveProperty("name");
      expect(extendedTwice.fields).toHaveProperty("email");
    });

    it("extend with nested struct works correctly", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => {
        operations.push(op);
      });

      const basePrimitive = Primitive.Struct({
        name: Primitive.String(),
      });

      const addressPrimitive = Primitive.Struct({
        city: Primitive.String(),
        zip: Primitive.String(),
      });

      const extendedPrimitive = basePrimitive.extend({
        address: addressPrimitive,
      });

      const proxy = extendedPrimitive._internal.createProxy(env, OperationPath.make(""));

      proxy.address.city.set("New York");

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("string.set");
      expect(operations[0]!.payload).toBe("New York");
      expect(operations[0]!.path.toTokens()).toEqual(["address", "city"]);
    });
  });

  describe("partial", () => {
    it("makes all fields optional", () => {
      const structPrimitive = Primitive.Struct({
        name: Primitive.String().required(),
        email: Primitive.String().required(),
        age: Primitive.Number().required(),
      });

      const partialPrimitive = structPrimitive.partial();

      // All fields should now be optional (not required)
      expect(partialPrimitive.fields).toHaveProperty("name");
      expect(partialPrimitive.fields).toHaveProperty("email");
      expect(partialPrimitive.fields).toHaveProperty("age");
    });

    it("partial struct allows empty set()", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => {
        operations.push(op);
      });

      const structPrimitive = Primitive.Struct({
        name: Primitive.String().required(),
        email: Primitive.String().required(),
      });

      const partialPrimitive = structPrimitive.partial();

      const proxy = partialPrimitive._internal.createProxy(env, OperationPath.make(""));

      // This should work without providing any fields since all are optional
      proxy.set({});

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("struct.set");
    });

    it("partial struct allows partial set()", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => {
        operations.push(op);
      });

      const structPrimitive = Primitive.Struct({
        name: Primitive.String().required(),
        email: Primitive.String().required(),
        age: Primitive.Number().required(),
      });

      const partialPrimitive = structPrimitive.partial();

      const proxy = partialPrimitive._internal.createProxy(env, OperationPath.make(""));

      // Only provide some fields
      proxy.set({ name: "John" });

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("struct.set");
      expect(operations[0]!.payload).toHaveProperty("name", "John");
    });

    it("partial struct field access still works", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => {
        operations.push(op);
      });

      const structPrimitive = Primitive.Struct({
        name: Primitive.String().required(),
        email: Primitive.String().required(),
      });

      const partialPrimitive = structPrimitive.partial();

      const proxy = partialPrimitive._internal.createProxy(env, OperationPath.make(""));

      proxy.name.set("John");

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("string.set");
      expect(operations[0]!.payload).toBe("John");
      expect(operations[0]!.path.toTokens()).toEqual(["name"]);
    });

    it("partial struct preserves required/default status of struct itself", () => {
      const structPrimitive = Primitive.Struct({
        name: Primitive.String().required(),
      }).required();

      const partialPrimitive = structPrimitive.partial();
      // The struct itself should still be required - verify via type system
      // Compile-time check: if the type doesn't match, this would be a type error
      type PartialTRequired = typeof partialPrimitive._TRequired;
      const _typeCheck: PartialTRequired = true as const;
      expect(_typeCheck).toBe(true);
    });

    it("partial struct applyOperation works correctly", () => {
      const structPrimitive = Primitive.Struct({
        name: Primitive.String().required(),
        email: Primitive.String().required(),
      });

      const partialPrimitive = structPrimitive.partial();

      const operation: Operation.Operation<any, any, any> = {
        kind: "string.set",
        path: OperationPath.make("name"),
        payload: "John",
      };

      const result = partialPrimitive._internal.applyOperation(undefined, operation);

      expect(result).toEqual({ name: "John" });
    });

    it("partial can be combined with extend", () => {
      const basePrimitive = Primitive.Struct({
        id: Primitive.String().required(),
        name: Primitive.String().required(),
      });

      // First extend, then partial
      const extendedPartial = basePrimitive
        .extend({
          email: Primitive.String().required(),
        })
        .partial();

      expect(extendedPartial.fields).toHaveProperty("id");
      expect(extendedPartial.fields).toHaveProperty("name");
      expect(extendedPartial.fields).toHaveProperty("email");
    });

    it("partial works with nested structs", () => {
      const addressPrimitive = Primitive.Struct({
        city: Primitive.String().required(),
        zip: Primitive.String().required(),
      });

      const personPrimitive = Primitive.Struct({
        name: Primitive.String().required(),
        address: addressPrimitive.required(),
      });

      const partialPrimitive = personPrimitive.partial();

      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => {
        operations.push(op);
      });

      const proxy = partialPrimitive._internal.createProxy(env, OperationPath.make(""));

      // Nested struct access should still work
      proxy.address.city.set("New York");

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("string.set");
      expect(operations[0]!.payload).toBe("New York");
      expect(operations[0]!.path.toTokens()).toEqual(["address", "city"]);
    });

    it("partial struct update() works correctly", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => {
        operations.push(op);
      });

      const structPrimitive = Primitive.Struct({
        name: Primitive.String().required(),
        email: Primitive.String().required(),
        age: Primitive.Number().required(),
      });

      const partialPrimitive = structPrimitive.partial();

      const proxy = partialPrimitive._internal.createProxy(env, OperationPath.make(""));

      proxy.update({ name: "Jane" });

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("string.set");
      expect(operations[0]!.payload).toBe("Jane");
    });

    it("partial({ stripDefaults: true }) clears field defaults", () => {
      const structPrimitive = Primitive.Struct({
        paddingTop: Primitive.Number().default(0),
        name: Primitive.String().default("Anonymous"),
        age: Primitive.Number(),
      });

      const partialPrimitive = structPrimitive.partial({ stripDefaults: true });

      // getInitialState should return undefined since all defaults are stripped
      expect(partialPrimitive._internal.getInitialState()).toBeUndefined();
    });

    it("partial({ stripDefaults: true }) toSnapshot returns undefined for unset fields", () => {
      const env = ProxyEnvironment.make(() => {});

      const structPrimitive = Primitive.Struct({
        paddingTop: Primitive.Number().default(0),
        name: Primitive.String().default("test"),
      });

      const partialPrimitive = structPrimitive.partial({ stripDefaults: true });
      const proxy = partialPrimitive._internal.createProxy(env, OperationPath.make(""));

      // With no state set, toSnapshot should return undefined (no defaults to fall back on)
      expect(proxy.toSnapshot()).toBeUndefined();
    });

    it("partial({ stripDefaults: true }) strips nested struct defaults", () => {
      const structPrimitive = Primitive.Struct({
        profile: Primitive.Struct({
          name: Primitive.String().default("Anonymous"),
          age: Primitive.Number().default(0),
        }),
      });

      const partialPrimitive = structPrimitive.partial({ stripDefaults: true });
      expect(partialPrimitive._internal.getInitialState()).toBeUndefined();

      const env = ProxyEnvironment.make(() => {});
      const proxy = partialPrimitive._internal.createProxy(env, OperationPath.make(""));
      expect(proxy.toSnapshot()).toBeUndefined();
    });

    it("partial({ stripDefaults: true }) does not re-apply nested defaults during set()", () => {
      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => {
        operations.push(op);
      });

      const structPrimitive = Primitive.Struct({
        profile: Primitive.Struct({
          name: Primitive.String().default("Anonymous"),
          age: Primitive.Number().default(0),
        }),
      });

      const partialPrimitive = structPrimitive.partial({ stripDefaults: true });
      const proxy = partialPrimitive._internal.createProxy(env, OperationPath.make(""));

      proxy.set({ profile: {} });

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("struct.set");
      expect(operations[0]!.payload).toEqual({ profile: {} });
    });

    it("partial({ stripDefaults: true }) keeps field proxies typed as possibly undefined", () => {
      const structPrimitive = Primitive.Struct({
        name: Primitive.String().default("Anonymous"),
      });

      const partialPrimitive = structPrimitive.partial({ stripDefaults: true });
      const env = ProxyEnvironment.make(() => {});
      const proxy = partialPrimitive._internal.createProxy(env, OperationPath.make(""));

      // Compile-time assertion: with defaults stripped, field access is optional.
      const value: string | undefined = proxy.name.get();
      expect(value).toBeUndefined();
    });

    it("partial() without stripDefaults preserves field defaults", () => {
      const structPrimitive = Primitive.Struct({
        paddingTop: Primitive.Number().default(0),
        name: Primitive.String().default("Anonymous"),
      });

      const partialPrimitive = structPrimitive.partial();

      // getInitialState should still return the defaults
      expect(partialPrimitive._internal.getInitialState()).toEqual({
        paddingTop: 0,
        name: "Anonymous",
      });
    });

    it("partial() without stripDefaults keeps field proxies typed as defined when defaults exist", () => {
      const structPrimitive = Primitive.Struct({
        name: Primitive.String().default("Anonymous"),
      });

      const partialPrimitive = structPrimitive.partial();
      const env = ProxyEnvironment.make(() => {});
      const proxy = partialPrimitive._internal.createProxy(env, OperationPath.make(""));

      // Compile-time assertion: without stripping defaults, field access remains defined.
      const value: string = proxy.name.get();
      expect(value).toBe("Anonymous");
    });
  });
});

// =============================================================================
// Array Primitive Tests (Ordered with ID + Fractional Index)
// =============================================================================
