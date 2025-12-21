import { describe, expect, it } from "@effect/vitest";
import * as Primitive from "../../src/Primitive";
import * as ProxyEnvironment from "../../src/ProxyEnvironment";
import * as OperationPath from "../../src/OperationPath";
import * as Operation from "../../src/Operation";

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
