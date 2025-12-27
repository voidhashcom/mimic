/**
 * Tree snapshot utility functions.
 *
 * Standalone helpers for traversing and querying tree snapshots.
 * All functions handle undefined snapshots gracefully.
 *
 * @since 0.0.1
 */

import type { TreeNodeSnapshot, TreePrimitive } from "../primitives/Tree.js";
import type { AnyTreeNodePrimitive } from "../primitives/TreeNode.js";

// =============================================================================
// Result Types
// =============================================================================

/**
 * Result of finding a node with path information.
 */
export interface NodeSearchResult<TNode extends AnyTreeNodePrimitive> {
  readonly node: TreeNodeSnapshot<TNode>;
  readonly path: readonly string[]; // Array of node IDs from root to this node
  readonly depth: number;
}

/**
 * Result of finding a parent node.
 */
export interface ParentSearchResult<TNode extends AnyTreeNodePrimitive> {
  readonly parent: TreeNodeSnapshot<TNode>;
  readonly childIndex: number; // Index of the target node in parent's children
}

/**
 * Flattened node with parent information.
 */
export interface FlattenedNode<TNode extends AnyTreeNodePrimitive> {
  readonly node: TreeNodeSnapshot<TNode>;
  readonly parentId: string | null;
  readonly depth: number;
}

/**
 * Options for tree traversal.
 */
export interface TraverseOptions {
  readonly order?: "pre" | "post";
}

// =============================================================================
// Core Functions
// =============================================================================

/**
 * Find a node by ID in a tree snapshot.
 *
 * @param snapshot - The root tree snapshot
 * @param id - The node ID to find
 * @returns The node snapshot if found, undefined otherwise
 */
export function findNodeById<TNode extends AnyTreeNodePrimitive>(
  snapshot: TreeNodeSnapshot<TNode> | undefined,
  id: string
): TreeNodeSnapshot<TNode> | undefined {
  if (!snapshot) return undefined;
  if (snapshot.id === id) return snapshot;

  for (const child of snapshot.children) {
    const found = findNodeById(child as TreeNodeSnapshot<TNode>, id);
    if (found) return found;
  }

  return undefined;
}

/**
 * Find a node by ID with full path information.
 *
 * @param snapshot - The root tree snapshot
 * @param id - The node ID to find
 * @returns NodeSearchResult with node, path, and depth, or undefined if not found
 */
export function findNodeWithPath<TNode extends AnyTreeNodePrimitive>(
  snapshot: TreeNodeSnapshot<TNode> | undefined,
  id: string
): NodeSearchResult<TNode> | undefined {
  if (!snapshot) return undefined;

  const search = (
    node: TreeNodeSnapshot<TNode>,
    currentPath: string[],
    depth: number
  ): NodeSearchResult<TNode> | undefined => {
    const path = [...currentPath, node.id];

    if (node.id === id) {
      return { node, path, depth };
    }

    for (const child of node.children) {
      const result = search(child as TreeNodeSnapshot<TNode>, path, depth + 1);
      if (result) return result;
    }

    return undefined;
  };

  return search(snapshot, [], 0);
}

/**
 * Get the parent node of a given node ID.
 *
 * @param snapshot - The root tree snapshot
 * @param nodeId - The ID of the node whose parent we want
 * @returns ParentSearchResult with parent node and child index, or undefined
 */
export function getParent<TNode extends AnyTreeNodePrimitive>(
  snapshot: TreeNodeSnapshot<TNode> | undefined,
  nodeId: string
): ParentSearchResult<TNode> | undefined {
  if (!snapshot) return undefined;

  // Check if any direct child is the target
  for (let i = 0; i < snapshot.children.length; i++) {
    const child = snapshot.children[i];
    if (child && child.id === nodeId) {
      return {
        parent: snapshot,
        childIndex: i,
      };
    }
  }

  // Recursively search children
  for (const child of snapshot.children) {
    const result = getParent(child as TreeNodeSnapshot<TNode>, nodeId);
    if (result) return result;
  }

  return undefined;
}

/**
 * Get a subtree rooted at a specific node ID.
 *
 * @param snapshot - The root tree snapshot
 * @param nodeId - The ID of the node to use as new root
 * @returns The subtree snapshot, or undefined if node not found
 */
export function getSubtree<TNode extends AnyTreeNodePrimitive>(
  snapshot: TreeNodeSnapshot<TNode> | undefined,
  nodeId: string
): TreeNodeSnapshot<TNode> | undefined {
  return findNodeById(snapshot, nodeId);
}

/**
 * Get all ancestor nodes from a node up to the root.
 *
 * @param snapshot - The root tree snapshot
 * @param nodeId - The ID of the node
 * @returns Array of ancestor snapshots from immediate parent to root, or empty array
 */
export function getAncestors<TNode extends AnyTreeNodePrimitive>(
  snapshot: TreeNodeSnapshot<TNode> | undefined,
  nodeId: string
): readonly TreeNodeSnapshot<TNode>[] {
  if (!snapshot) return [];

  const result = findNodeWithPath(snapshot, nodeId);
  if (!result || result.path.length <= 1) return [];

  // Path includes the node itself, so we need all nodes except the last one
  const ancestorIds = result.path.slice(0, -1);
  const ancestors: TreeNodeSnapshot<TNode>[] = [];

  // Collect ancestors in reverse order (parent first, root last)
  for (let i = ancestorIds.length - 1; i >= 0; i--) {
    const id = ancestorIds[i];
    if (id) {
      const ancestor = findNodeById(snapshot, id);
      if (ancestor) {
        ancestors.push(ancestor);
      }
    }
  }

  return ancestors;
}

/**
 * Get all descendant nodes of a given node (flat array).
 *
 * @param snapshot - The root tree snapshot
 * @param nodeId - The ID of the node (if undefined, returns all descendants of root)
 * @returns Flat array of all descendant node snapshots
 */
export function getDescendants<TNode extends AnyTreeNodePrimitive>(
  snapshot: TreeNodeSnapshot<TNode> | undefined,
  nodeId?: string
): readonly TreeNodeSnapshot<TNode>[] {
  if (!snapshot) return [];

  const startNode = nodeId ? findNodeById(snapshot, nodeId) : snapshot;
  if (!startNode) return [];

  const descendants: TreeNodeSnapshot<TNode>[] = [];

  const collect = (node: TreeNodeSnapshot<TNode>) => {
    for (const child of node.children) {
      descendants.push(child as TreeNodeSnapshot<TNode>);
      collect(child as TreeNodeSnapshot<TNode>);
    }
  };

  collect(startNode);
  return descendants;
}

/**
 * Get siblings of a node (nodes with the same parent).
 *
 * @param snapshot - The root tree snapshot
 * @param nodeId - The ID of the node
 * @param includeSelf - Whether to include the node itself (default: false)
 * @returns Array of sibling snapshots
 */
export function getSiblings<TNode extends AnyTreeNodePrimitive>(
  snapshot: TreeNodeSnapshot<TNode> | undefined,
  nodeId: string,
  includeSelf: boolean = false
): readonly TreeNodeSnapshot<TNode>[] {
  if (!snapshot) return [];

  const parentResult = getParent(snapshot, nodeId);

  // If no parent, this is the root - root has no siblings
  if (!parentResult) return [];

  const siblings = parentResult.parent.children as readonly TreeNodeSnapshot<TNode>[];

  if (includeSelf) {
    return siblings;
  }

  return siblings.filter((s) => s.id !== nodeId);
}

// =============================================================================
// Query Functions
// =============================================================================

/**
 * Find the first node matching a predicate.
 *
 * @param snapshot - The root tree snapshot
 * @param predicate - Function to test each node
 * @returns First matching node snapshot, or undefined
 */
export function findNode<TNode extends AnyTreeNodePrimitive>(
  snapshot: TreeNodeSnapshot<TNode> | undefined,
  predicate: (node: TreeNodeSnapshot<TNode>) => boolean
): TreeNodeSnapshot<TNode> | undefined {
  if (!snapshot) return undefined;

  if (predicate(snapshot)) return snapshot;

  for (const child of snapshot.children) {
    const found = findNode(child as TreeNodeSnapshot<TNode>, predicate);
    if (found) return found;
  }

  return undefined;
}

/**
 * Find all nodes matching a predicate.
 *
 * @param snapshot - The root tree snapshot
 * @param predicate - Function to test each node
 * @returns Array of matching node snapshots
 */
export function findNodes<TNode extends AnyTreeNodePrimitive>(
  snapshot: TreeNodeSnapshot<TNode> | undefined,
  predicate: (node: TreeNodeSnapshot<TNode>) => boolean
): readonly TreeNodeSnapshot<TNode>[] {
  if (!snapshot) return [];

  const results: TreeNodeSnapshot<TNode>[] = [];

  const search = (node: TreeNodeSnapshot<TNode>) => {
    if (predicate(node)) {
      results.push(node);
    }
    for (const child of node.children) {
      search(child as TreeNodeSnapshot<TNode>);
    }
  };

  search(snapshot);
  return results;
}

/**
 * Get the depth of a specific node (0 = root).
 *
 * @param snapshot - The root tree snapshot
 * @param nodeId - The ID of the node
 * @returns The depth, or -1 if not found
 */
export function getNodeDepth<TNode extends AnyTreeNodePrimitive>(
  snapshot: TreeNodeSnapshot<TNode> | undefined,
  nodeId: string
): number {
  if (!snapshot) return -1;

  const result = findNodeWithPath(snapshot, nodeId);
  return result ? result.depth : -1;
}

/**
 * Check if one node is an ancestor of another.
 *
 * @param snapshot - The root tree snapshot
 * @param ancestorId - Potential ancestor node ID
 * @param descendantId - Potential descendant node ID
 * @returns true if ancestorId is an ancestor of descendantId
 */
export function isAncestorOf<TNode extends AnyTreeNodePrimitive>(
  snapshot: TreeNodeSnapshot<TNode> | undefined,
  ancestorId: string,
  descendantId: string
): boolean {
  if (!snapshot) return false;

  const result = findNodeWithPath(snapshot, descendantId);
  if (!result) return false;

  // Check if ancestorId is in the path (excluding the descendant itself)
  return result.path.slice(0, -1).includes(ancestorId);
}

// =============================================================================
// Traversal Functions
// =============================================================================

/**
 * Traverse the tree and call a visitor function for each node.
 * Return false from visitor to stop traversal.
 *
 * @param snapshot - The root tree snapshot
 * @param visitor - Function called for each node (return false to stop)
 * @param options - Traversal options (order: 'pre' | 'post')
 */
export function traverse<TNode extends AnyTreeNodePrimitive>(
  snapshot: TreeNodeSnapshot<TNode> | undefined,
  visitor: (node: TreeNodeSnapshot<TNode>, depth: number) => void | false,
  options: TraverseOptions = {}
): void {
  if (!snapshot) return;

  const { order = "pre" } = options;

  const visit = (node: TreeNodeSnapshot<TNode>, depth: number): boolean => {
    if (order === "pre") {
      const result = visitor(node, depth);
      if (result === false) return false;
    }

    for (const child of node.children) {
      const shouldContinue = visit(child as TreeNodeSnapshot<TNode>, depth + 1);
      if (!shouldContinue) return false;
    }

    if (order === "post") {
      const result = visitor(node, depth);
      if (result === false) return false;
    }

    return true;
  };

  visit(snapshot, 0);
}

/**
 * Flatten the tree into an array with parent information.
 *
 * @param snapshot - The root tree snapshot
 * @returns Array of { node, parentId, depth } objects
 */
export function flattenTree<TNode extends AnyTreeNodePrimitive>(
  snapshot: TreeNodeSnapshot<TNode> | undefined
): readonly FlattenedNode<TNode>[] {
  if (!snapshot) return [];

  const result: FlattenedNode<TNode>[] = [];

  const flatten = (
    node: TreeNodeSnapshot<TNode>,
    parentId: string | null,
    depth: number
  ) => {
    result.push({ node, parentId, depth });

    for (const child of node.children) {
      flatten(child as TreeNodeSnapshot<TNode>, node.id, depth + 1);
    }
  };

  flatten(snapshot, null, 0);
  return result;
}

/**
 * Map over all nodes in the tree, transforming each node's data.
 * Preserves tree structure while transforming node content.
 *
 * @param snapshot - The root tree snapshot
 * @param mapper - Function to transform each node
 * @returns New tree structure with transformed nodes, or undefined
 */
export function mapTree<TNode extends AnyTreeNodePrimitive, R>(
  snapshot: TreeNodeSnapshot<TNode> | undefined,
  mapper: (node: TreeNodeSnapshot<TNode>, depth: number) => R
): { value: R; children: ReturnType<typeof mapTree<TNode, R>>[] } | undefined {
  if (!snapshot) return undefined;

  const map = (
    node: TreeNodeSnapshot<TNode>,
    depth: number
  ): { value: R; children: ReturnType<typeof mapTree<TNode, R>>[] } => {
    const value = mapper(node, depth);
    const children = node.children.map((child) =>
      map(child as TreeNodeSnapshot<TNode>, depth + 1)
    );
    return { value, children };
  };

  return map(snapshot, 0);
}

// =============================================================================
// Schema Functions (work with TreeNodePrimitive, not snapshots)
// =============================================================================

/**
 * Build a lookup map from node type strings to their TreeNodePrimitive definitions.
 * Useful for resolving snapshot node types back to their schema definitions.
 *
 * @param tree - The TreePrimitive to analyze
 * @returns Map from type string to TreeNodePrimitive
 *
 * @example
 * ```ts
 * const typeMap = buildNodeTypeMap(fileTree);
 * const folderPrimitive = typeMap.get("folder"); // FolderNode
 * ```
 */
export function buildNodeTypeMap<TRoot extends AnyTreeNodePrimitive>(
  tree: TreePrimitive<TRoot>
): Map<string, AnyTreeNodePrimitive> {
  const map = new Map<string, AnyTreeNodePrimitive>();
  const visited = new Set<string>();

  const visit = (node: AnyTreeNodePrimitive) => {
    if (visited.has(node.type)) return;
    visited.add(node.type);
    map.set(node.type, node);

    for (const child of node.children) {
      visit(child);
    }
  };

  visit(tree.root);
  return map;
}

/**
 * Get the TreeNodePrimitive definition for a snapshot node.
 * Requires the tree schema to resolve the type string to its primitive.
 *
 * @param tree - The TreePrimitive schema
 * @param snapshot - The node snapshot to get the primitive for
 * @returns The TreeNodePrimitive, or undefined if not found
 *
 * @example
 * ```ts
 * const node = findNodeById(treeSnapshot, "some-id");
 * const primitive = getNodePrimitive(fileTree, node);
 * // primitive is FolderNode or FileNode depending on node.type
 * ```
 */
export function getNodePrimitive<TRoot extends AnyTreeNodePrimitive>(
  tree: TreePrimitive<TRoot>,
  snapshot: TreeNodeSnapshot<AnyTreeNodePrimitive>
): AnyTreeNodePrimitive | undefined {
  return getNodeTypeByName(tree, snapshot.type);
}

/**
 * Get the allowed child types for a snapshot node.
 * Combines schema lookup with the node's allowed children.
 *
 * @param tree - The TreePrimitive schema
 * @param snapshot - The node snapshot to get allowed children for
 * @returns Array of allowed child TreeNodePrimitives, or empty array if not found
 *
 * @example
 * ```ts
 * const node = findNodeById(treeSnapshot, "folder-id");
 * const allowedChildren = getAllowedChildTypesForNode(fileTree, node);
 * // Returns [FolderNode, FileNode] if the folder can contain both
 * ```
 */
export function getAllowedChildTypesForNode<TRoot extends AnyTreeNodePrimitive>(
  tree: TreePrimitive<TRoot>,
  snapshot: TreeNodeSnapshot<AnyTreeNodePrimitive>
): readonly AnyTreeNodePrimitive[] {
  const primitive = getNodePrimitive(tree, snapshot);
  if (!primitive) return [];
  return primitive.children;
}

/**
 * Check if a child type is allowed for a specific snapshot node.
 *
 * @param tree - The TreePrimitive schema
 * @param parentSnapshot - The parent node snapshot
 * @param childTypeName - The type string of the potential child
 * @returns true if the child type is allowed
 *
 * @example
 * ```ts
 * const folder = findNodeById(treeSnapshot, "folder-id");
 * canAddChildType(fileTree, folder, "file"); // true
 * canAddChildType(fileTree, folder, "unknown"); // false
 * ```
 */
export function canAddChildType<TRoot extends AnyTreeNodePrimitive>(
  tree: TreePrimitive<TRoot>,
  parentSnapshot: TreeNodeSnapshot<AnyTreeNodePrimitive>,
  childTypeName: string
): boolean {
  const primitive = getNodePrimitive(tree, parentSnapshot);
  if (!primitive) return false;
  return primitive.isChildAllowed(childTypeName);
}

/**
 * Get all allowed child node types for a specific node type.
 *
 * @param nodeType - The TreeNodePrimitive to get children for
 * @returns Array of allowed child TreeNodePrimitives
 *
 * @example
 * ```ts
 * const FolderNode = TreeNode("folder", { ... });
 * const FileNode = TreeNode("file", { ... });
 *
 * // Get allowed children for FolderNode
 * const allowedChildren = getAllowedChildTypes(FolderNode);
 * // Returns [FolderNode, FileNode] if folder can contain both
 * ```
 */
export function getAllowedChildTypes<TNode extends AnyTreeNodePrimitive>(
  nodeType: TNode
): readonly AnyTreeNodePrimitive[] {
  return nodeType.children;
}

/**
 * Get all unique node types reachable in a tree schema.
 * Recursively traverses the tree structure starting from the root.
 *
 * @param tree - The TreePrimitive to analyze
 * @returns Array of all unique TreeNodePrimitives in the tree schema
 *
 * @example
 * ```ts
 * const fileTree = Tree({ root: FolderNode });
 * const allNodeTypes = getAllNodeTypes(fileTree);
 * // Returns [FolderNode, FileNode] - all possible node types
 * ```
 */
export function getAllNodeTypes<TRoot extends AnyTreeNodePrimitive>(
  tree: TreePrimitive<TRoot>
): readonly AnyTreeNodePrimitive[] {
  const visited = new Set<string>();
  const result: AnyTreeNodePrimitive[] = [];

  const visit = (node: AnyTreeNodePrimitive) => {
    if (visited.has(node.type)) return;
    visited.add(node.type);
    result.push(node);

    for (const child of node.children) {
      visit(child);
    }
  };

  visit(tree.root);
  return result;
}

/**
 * Get the node type primitive by its type string from a tree schema.
 *
 * @param tree - The TreePrimitive to search
 * @param typeName - The type string to find (e.g., "folder", "file")
 * @returns The matching TreeNodePrimitive, or undefined if not found
 *
 * @example
 * ```ts
 * const fileTree = Tree({ root: FolderNode });
 * const folderType = getNodeTypeByName(fileTree, "folder");
 * // Returns FolderNode
 * ```
 */
export function getNodeTypeByName<TRoot extends AnyTreeNodePrimitive>(
  tree: TreePrimitive<TRoot>,
  typeName: string
): AnyTreeNodePrimitive | undefined {
  const allTypes = getAllNodeTypes(tree);
  return allTypes.find((node) => node.type === typeName);
}

/**
 * Check if a child type is allowed under a parent type.
 *
 * @param parentType - The parent TreeNodePrimitive
 * @param childTypeName - The type string of the potential child
 * @returns true if the child type is allowed
 *
 * @example
 * ```ts
 * isChildTypeAllowed(FolderNode, "file"); // true if folder can contain files
 * isChildTypeAllowed(FileNode, "folder"); // false - files can't have children
 * ```
 */
export function isChildTypeAllowed(
  parentType: AnyTreeNodePrimitive,
  childTypeName: string
): boolean {
  return parentType.isChildAllowed(childTypeName);
}
