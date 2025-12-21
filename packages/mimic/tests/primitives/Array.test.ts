import { describe, expect, it } from "@effect/vitest";
import * as Primitive from "../../src/Primitive";
import * as ProxyEnvironment from "../../src/ProxyEnvironment";
import * as OperationPath from "../../src/OperationPath";
import * as Operation from "../../src/Operation";

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
