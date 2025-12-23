import { describe, expect, it } from "@effect/vitest";
import * as Primitive from "../../src/Primitive";
import * as ProxyEnvironment from "../../src/ProxyEnvironment";
import * as OperationPath from "../../src/OperationPath";
import * as Operation from "../../src/Operation";

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
      expect(operations[0]!.payload).toEqual({ name: "John Doe", age: 30, email: undefined });
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
      expect(operations[0]!.payload).toEqual({ name: "John Doe", age: 30, email: undefined });
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

    it("update() skips undefined values", () => {
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

      expect(operations).toHaveLength(1);
      expect(operations[0]!.payload).toBe("John");
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
});

// =============================================================================
// Array Primitive Tests (Ordered with ID + Fractional Index)
// =============================================================================
