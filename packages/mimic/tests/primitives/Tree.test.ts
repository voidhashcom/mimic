import { describe, expect, it } from "@effect/vitest";
import * as Primitive from "../../src/Primitive";
import * as ProxyEnvironment from "../../src/ProxyEnvironment";
import * as OperationPath from "../../src/OperationPath";
import * as Operation from "../../src/Operation";

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
