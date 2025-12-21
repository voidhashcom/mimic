import { describe, expect, it } from "@effect/vitest";
import * as Primitive from "../../src/Primitive";
import * as ProxyEnvironment from "../../src/ProxyEnvironment";
import * as OperationPath from "../../src/OperationPath";
import * as Operation from "../../src/Operation";

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
