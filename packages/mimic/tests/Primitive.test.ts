import { describe, expect, it } from "@effect/vitest";
import * as Primitive from "../src/Primitive";
import * as ProxyEnvironment from "../src/ProxyEnvironment";
import * as OperationPath from "../src/OperationPath";
import * as Operation from "../src/Operation";

// =============================================================================
// Integration Tests
// =============================================================================

describe("Integration - Complex Nested Structures", () => {
  it("handles deeply nested structs with arrays", () => {
    const schema = Primitive.Struct({
      users: Primitive.Array(
        Primitive.Struct({
        name: Primitive.String(),
          age: Primitive.Number(),
          tags: Primitive.Array(Primitive.String()),
        })
      ),
    });

      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => {
        operations.push(op);
      });

    const proxy = schema._internal.createProxy(env, OperationPath.make(""));

    // Create a user
    proxy.users.push({
      name: "Alice",
      age: 30,
      tags: [],
    });

      expect(operations).toHaveLength(1);
      expect(operations[0]!.kind).toBe("array.insert");
  });

  it("handles nested structs with unions", () => {
    const schema = Primitive.Struct({
      content: Primitive.Union({
      variants: {
        text: Primitive.Struct({
            type: Primitive.Literal("text"),
            value: Primitive.String(),
          }),
          image: Primitive.Struct({
            type: Primitive.Literal("image"),
            url: Primitive.String(),
            alt: Primitive.String(),
        }),
      },
      }),
    });

    const operations: Operation.Operation<any, any, any>[] = [];
    const env = ProxyEnvironment.make((op) => {
      operations.push(op);
    });

    const proxy = schema._internal.createProxy(env, OperationPath.make(""));

    proxy.content.set({
      type: "text",
      value: "Hello",
    });

    expect(operations).toHaveLength(1);
    expect(operations[0]!.kind).toBe("union.set");
  });
});

describe("transformOperation", () => {
  const makeOp = (kind: string, path: string, payload: any) => ({
    kind,
    path: OperationPath.make(path),
    payload,
  });

  describe("cross-primitive transformations", () => {
    it("transforms operations on different struct fields independently", () => {
      const schema = Primitive.Struct({
      name: Primitive.String(),
        age: Primitive.Number(),
    });

      const clientOp = makeOp("string.set", "name", "Alice");
      const serverOp = makeOp("number.set", "age", 30);

      const result = schema._internal.transformOperation(clientOp, serverOp);

      expect(result.type).toBe("transformed");
      if (result.type === "transformed") {
        expect(result.operation.path.toTokens()).toEqual(["name"]);
      }
    });

    it("transforms operations on different array elements independently", () => {
      const schema = Primitive.Array(Primitive.String());

      const operations: Operation.Operation<any, any, any>[] = [];
      const env = ProxyEnvironment.make((op) => {
        operations.push(op);
      });

      const proxy = schema._internal.createProxy(env, OperationPath.make("items"));

      // Insert two items
      proxy.push("first");
      proxy.push("second");

      const firstId = operations[0]!.payload.id;
      const secondId = operations[1]!.payload.id;

      const clientOp = makeOp("string.set", `items/${firstId}`, "updated first");
      const serverOp = makeOp("string.set", `items/${secondId}`, "updated second");

      const result = schema._internal.transformOperation(clientOp, serverOp);

      expect(result.type).toBe("transformed");
    });
  });
});

// =============================================================================
// Integration - Tree with Complex Structures
// =============================================================================

describe("Integration - Tree with Complex Structures", () => {
    const FileNode = Primitive.TreeNode("file", {
    data: Primitive.Struct({
      name: Primitive.String(),
      size: Primitive.Number(),
      metadata: Primitive.Struct({
        author: Primitive.String(),
        created: Primitive.Number(),
      }),
    }),
    children: [] as const,
  });

  const FolderNode = Primitive.TreeNode("folder", {
    data: Primitive.Struct({ name: Primitive.String() }),
    children: (): readonly Primitive.AnyTreeNodePrimitive[] => [FolderNode, FileNode],
  });

  const fileSystemTree = Primitive.Tree({
    root: FolderNode,
  });

  it("handles complex tree structures with nested data", () => {
    const operations: Operation.Operation<any, any, any>[] = [];
    let state: Primitive.TreeState<typeof FolderNode> = [];
    
    const env = ProxyEnvironment.make({
      onOperation: (op) => {
        operations.push(op);
        state = fileSystemTree._internal.applyOperation(state, op);
      },
      getState: () => state,
      generateId: () => crypto.randomUUID(),
    });

      const proxy = fileSystemTree._internal.createProxy(env, OperationPath.make(""));

    const rootId = proxy.insertFirst(null, FolderNode, { name: "root" });
    const fileId = proxy.insertFirst(rootId, FileNode, {
      name: "test.txt",
      size: 1024,
      metadata: {
        author: "Alice",
        created: Date.now(),
      },
    });

    expect(operations.length).toBeGreaterThan(0);
  });
  });

describe("toSnapshot", () => {
  // Helper to extract state at a given path
  const getStateAtPath = (state: unknown, path: OperationPath.OperationPath): unknown => {
    const tokens = path.toTokens().filter((t: string) => t !== "");
    let current = state;
    for (const token of tokens) {
      if (current === undefined || current === null) return undefined;
      if (typeof current === "object") {
        current = (current as Record<string, unknown>)[token];
      } else {
        return undefined;
      }
    }
    return current;
  };

  describe("nested structures", () => {
    it("creates snapshot for struct with nested arrays", () => {
      const schema = Primitive.Struct({
        items: Primitive.Array(
          Primitive.Struct({
            name: Primitive.String(),
            count: Primitive.Number(),
          })
        ),
      });

      type Snapshot = Primitive.InferSnapshot<typeof schema>;

    const operations: Operation.Operation<any, any, any>[] = [];
      let state: any = undefined;

    const env = ProxyEnvironment.make({
      onOperation: (op) => {
        operations.push(op);
          state = schema._internal.applyOperation(state, op);
        },
        getState: (path) => getStateAtPath(state, path),
        generateId: () => crypto.randomUUID(),
      });

      const proxy = schema._internal.createProxy(env, OperationPath.make(""));

      proxy.items.push({ name: "Item 1", count: 10 });
      proxy.items.push({ name: "Item 2", count: 20 });

    const snapshot = proxy.toSnapshot();

    expect(snapshot).toBeDefined();
      if (snapshot) {
        expect(snapshot.items).toHaveLength(2);
      }
    });

    it("creates snapshot for union with nested structs", () => {
      const schema = Primitive.Union({
        variants: {
          text: Primitive.Struct({
            type: Primitive.Literal("text"),
            content: Primitive.String(),
          }),
          list: Primitive.Struct({
            type: Primitive.Literal("list"),
            items: Primitive.Array(Primitive.String()),
          }),
        },
      });

      type Snapshot = Primitive.InferSnapshot<typeof schema>;

    const operations: Operation.Operation<any, any, any>[] = [];
      let state: any = undefined;

    const env = ProxyEnvironment.make({
      onOperation: (op) => {
        operations.push(op);
          state = schema._internal.applyOperation(state, op);
        },
        getState: (path) => getStateAtPath(state, path),
        generateId: () => crypto.randomUUID(),
      });

      const proxy = schema._internal.createProxy(env, OperationPath.make(""));

      // Set union value with items already populated (simpler than pushing one by one)
      const itemsWithEntries = [
        { id: "id-1", pos: "a0", value: "item1" },
        { id: "id-2", pos: "a1", value: "item2" },
      ];
      proxy.set({
        type: "list",
        items: itemsWithEntries,
      });

      // Verify state was updated
      expect(state).toBeDefined();
      if (state && "items" in state) {
        expect((state.items as any[]).length).toBe(2);
      }

      const snapshot = proxy.toSnapshot();

      expect(snapshot).toBeDefined();
      if (snapshot && "items" in snapshot) {
        // The snapshot should have items array with 2 entries
        const items = snapshot.items as Array<{ id: string; value: string }>;
        expect(items).toHaveLength(2);
      }
      });
    });
      });

describe("Validation", () => {
  describe("cross-field validation", () => {
    it("validates struct fields together", () => {
      const schema = Primitive.Struct({
        start: Primitive.Number(),
        end: Primitive.Number(),
      }).refine(
        (value) => value.end >= value.start,
        "End must be >= start"
      );

      const operations: Operation.Operation<any, any, any>[] = [];
      let state: any = undefined;

      const env = ProxyEnvironment.make({
        onOperation: (op) => {
          operations.push(op);
          state = schema._internal.applyOperation(state, op);
        },
        getState: () => state,
        generateId: () => crypto.randomUUID(),
      });

      const proxy = schema._internal.createProxy(env, OperationPath.make(""));

      expect(() => {
        proxy.set({ start: 10, end: 5 });
      }).toThrow(Primitive.ValidationError);
    });
  });

  describe("array validation", () => {
    it("validates array length constraints", () => {
      const schema = Primitive.Array(Primitive.String())
        .minLength(2)
        .maxLength(5);

      const operations: Operation.Operation<any, any, any>[] = [];
      let state: any = [];

      const env = ProxyEnvironment.make({
        onOperation: (op) => {
          operations.push(op);
          state = schema._internal.applyOperation(state, op);
        },
        getState: () => state,
        generateId: () => crypto.randomUUID(),
      });

      const proxy = schema._internal.createProxy(env, OperationPath.make(""));

      // Push first item - this will fail validation because minLength is 2
      expect(() => {
        proxy.push("item1");
      }).toThrow(Primitive.ValidationError);

      // Reset state and push both items at once using set
      state = [];
      const twoItems = [
        { id: "id-1", pos: "a0", value: "item1" },
        { id: "id-2", pos: "a1", value: "item2" },
      ];
      state = schema._internal.applyOperation(state, {
        kind: "array.set",
        path: OperationPath.make(""),
        payload: twoItems,
      });

      // Should pass validation with 2 items
      expect(state.length).toBe(2);

      // Try to set array with too many items
      const tooManyItems = Array.from({ length: 10 }, (_, i) => ({
        id: `id-${i}`,
        pos: `pos-${i}`,
        value: `item${i}`,
      }));

      expect(() => {
        schema._internal.applyOperation(state, {
        kind: "array.set",
        path: OperationPath.make(""),
          payload: tooManyItems,
        });
      }).toThrow();
    });
  });
});
