import { Effect, Schema } from "effect";
import * as OperationDefinition from "../OperationDefinition";
import * as Operation from "../Operation";
import * as OperationPath from "../OperationPath";
import * as ProxyEnvironment from "../ProxyEnvironment";
import * as Transform from "../Transform";
import * as FractionalIndex from "../FractionalIndex";
import type { Primitive, PrimitiveInternal, Validator, InferProxy, AnyPrimitive, InferSetInput, InferUpdateInput } from "./shared";
import { ValidationError, applyDefaults } from "./shared";
import { runValidators } from "./shared";
import type { AnyTreeNodePrimitive, InferTreeNodeType, InferTreeNodeDataState, InferTreeNodeChildren } from "./TreeNode";
import { InferStructState, StructSetInput, StructUpdateValue } from "./Struct";
import { StructPrimitive } from "./Struct";


/**
 * A node in the tree state (flat storage format)
 */
export interface TreeNodeState {
  readonly id: string;              // Unique node identifier (UUID)
  readonly type: string;            // Node type discriminator
  readonly parentId: string | null; // Parent node ID (null for root)
  readonly pos: string;             // Fractional index for sibling ordering
  readonly data: unknown;           // Node-specific data
}

/**
 * Typed node state for a specific node type
 */
export interface TypedTreeNodeState<TNode extends AnyTreeNodePrimitive> {
  readonly id: string;
  readonly type: InferTreeNodeType<TNode>;
  readonly parentId: string | null;
  readonly pos: string;
  readonly data: InferTreeNodeDataState<TNode>;
}

/**
 * The state type for trees - a flat array of nodes
 */
export type TreeState<_TRoot extends AnyTreeNodePrimitive> = readonly TreeNodeState[];

/**
 * Helper to get children sorted by position
 */
const getOrderedChildren = (
  nodes: readonly TreeNodeState[],
  parentId: string | null
): TreeNodeState[] => {
  return [...nodes]
    .filter(n => n.parentId === parentId)
    .sort((a, b) => a.pos < b.pos ? -1 : a.pos > b.pos ? 1 : 0);
};

/**
 * Get all descendant IDs of a node (recursive)
 */
const getDescendantIds = (
  nodes: readonly TreeNodeState[],
  nodeId: string
): string[] => {
  const children = nodes.filter(n => n.parentId === nodeId);
  const descendantIds: string[] = [];
  for (const child of children) {
    descendantIds.push(child.id);
    descendantIds.push(...getDescendantIds(nodes, child.id));
  }
  return descendantIds;
};

/**
 * Check if moving a node to a new parent would create a cycle
 */
const wouldCreateCycle = (
  nodes: readonly TreeNodeState[],
  nodeId: string,
  newParentId: string | null
): boolean => {
  if (newParentId === null) return false;
  if (newParentId === nodeId) return true;
  
  const descendants = getDescendantIds(nodes, nodeId);
  return descendants.includes(newParentId);
};

/**
 * Generate a fractional position between two positions
 */
const generateTreePosBetween = (left: string | null, right: string | null): string => {
  const charSet = FractionalIndex.base62CharSet();
  return Effect.runSync(FractionalIndex.generateKeyBetween(left, right, charSet));
};

/**
 * Snapshot of a single node for UI rendering (data properties spread at node level)
 */
export type TreeNodeSnapshot<TNode extends AnyTreeNodePrimitive> = {
  readonly id: string;
  readonly type: InferTreeNodeType<TNode>;
  readonly children: TreeNodeSnapshot<InferTreeNodeChildren<TNode>>[];
} & InferTreeNodeDataState<TNode>;

/**
 * Infer the snapshot type for a tree (recursive tree structure for UI)
 */
export type InferTreeSnapshot<T extends TreePrimitive<any>> =
  T extends TreePrimitive<infer TRoot> ? TreeNodeSnapshot<TRoot> : never;

/**
 * Helper type to infer the update value type from a TreeNode's data.
 * Uses StructUpdateValue directly to get field-level partial update semantics.
 * All fields are optional in update operations.
 */
export type TreeNodeUpdateValue<TNode extends AnyTreeNodePrimitive> = 
  TNode["data"] extends StructPrimitive<infer TFields, any, any>
    ? StructUpdateValue<TFields>
    : InferUpdateInput<TNode["data"]>;

/**
 * Helper type to infer the input type for node data (respects field defaults).
 * Uses StructSetInput directly so that:
 * - Fields that are required AND have no default must be provided
 * - Fields that are optional OR have defaults can be omitted
 * 
 * This bypasses the struct-level NeedsValue wrapper since tree inserts
 * always require a data object (even if empty for all-optional fields).
 */
export type TreeNodeDataSetInput<TNode extends AnyTreeNodePrimitive> = 
  TNode["data"] extends StructPrimitive<infer TFields, any, any>
    ? StructSetInput<TFields>
    : InferSetInput<TNode["data"]>;

/**
 * Typed proxy for a specific node type - provides type-safe data access
 */
export interface TypedNodeProxy<TNode extends AnyTreeNodePrimitive> {
  /** The node ID */
  readonly id: string;
  /** The node type */
  readonly type: InferTreeNodeType<TNode>;
  /** Access the node's data proxy */
  readonly data: InferProxy<TNode["data"]>;
  /** Get the raw node state */
  get(): TypedTreeNodeState<TNode>;
  /** Updates only the specified data fields (partial update, handles nested structs recursively) */
  update(value: TreeNodeUpdateValue<TNode>): void;
}

/**
 * Node proxy with type narrowing capabilities
 */
export interface TreeNodeProxyBase<_TRoot extends AnyTreeNodePrimitive> {
  /** The node ID */
  readonly id: string;
  /** The node type (string) */
  readonly type: string;
  /** Type guard - narrows the proxy to a specific node type */
  is<TNode extends AnyTreeNodePrimitive>(
    nodeType: TNode
  ): this is TypedNodeProxy<TNode>;
  /** Type assertion - returns typed proxy (throws if wrong type) */
  as<TNode extends AnyTreeNodePrimitive>(
    nodeType: TNode
  ): TypedNodeProxy<TNode>;
  /** Get the raw node state */
  get(): TreeNodeState;
}

/**
 * Proxy for accessing and modifying tree nodes
 */
export interface TreeProxy<TRoot extends AnyTreeNodePrimitive> {
  /** Gets the entire tree state (flat array of nodes) */
  get(): TreeState<TRoot>;
  
  /** Replaces the entire tree */
  set(nodes: TreeState<TRoot>): void;
  
  /** Gets the root node state */
  root(): TypedTreeNodeState<TRoot> | undefined;
  
  /** Gets ordered children states of a parent (null for root's children) */
  children(parentId: string | null): TreeNodeState[];
  
  /** Gets a node proxy by ID with type narrowing capabilities */
  node(id: string): TreeNodeProxyBase<TRoot> | undefined;
  
  /** Insert a new node as the first child (applies defaults for node data) */
  insertFirst<TNode extends AnyTreeNodePrimitive>(
    parentId: string | null,
    nodeType: TNode,
    data: TreeNodeDataSetInput<TNode>
  ): string;
  
  /** Insert a new node as the last child (applies defaults for node data) */
  insertLast<TNode extends AnyTreeNodePrimitive>(
    parentId: string | null,
    nodeType: TNode,
    data: TreeNodeDataSetInput<TNode>
  ): string;
  
  /** Insert a new node at a specific index among siblings (applies defaults for node data) */
  insertAt<TNode extends AnyTreeNodePrimitive>(
    parentId: string | null,
    index: number,
    nodeType: TNode,
    data: TreeNodeDataSetInput<TNode>
  ): string;
  
  /** Insert a new node after a sibling (applies defaults for node data) */
  insertAfter<TNode extends AnyTreeNodePrimitive>(
    siblingId: string,
    nodeType: TNode,
    data: TreeNodeDataSetInput<TNode>
  ): string;
  
  /** Insert a new node before a sibling (applies defaults for node data) */
  insertBefore<TNode extends AnyTreeNodePrimitive>(
    siblingId: string,
    nodeType: TNode,
    data: TreeNodeDataSetInput<TNode>
  ): string;
  
  /** Remove a node and all its descendants */
  remove(id: string): void;
  
  /** Move a node to a new parent at a specific index */
  move(nodeId: string, newParentId: string | null, toIndex: number): void;
  
  /** Move a node after a sibling */
  moveAfter(nodeId: string, siblingId: string): void;
  
  /** Move a node before a sibling */
  moveBefore(nodeId: string, siblingId: string): void;
  
  /** Move a node to be the first child of a parent */
  moveToFirst(nodeId: string, newParentId: string | null): void;
  
  /** Move a node to be the last child of a parent */
  moveToLast(nodeId: string, newParentId: string | null): void;
  
  /** Returns a typed proxy for a specific node's data */
  at<TNode extends AnyTreeNodePrimitive>(
    id: string,
    nodeType: TNode
  ): InferProxy<TNode["data"]>;
  
  /** Updates only the specified data fields of a node (partial update) */
  updateAt<TNode extends AnyTreeNodePrimitive>(
    id: string,
    nodeType: TNode,
    value: TreeNodeUpdateValue<TNode>
  ): void;
  
  /** Convert tree to a nested snapshot for UI rendering */
  toSnapshot(): TreeNodeSnapshot<TRoot> | undefined;
}

interface TreePrimitiveSchema<TRoot extends AnyTreeNodePrimitive> {
  readonly required: boolean;
  readonly defaultValue: TreeState<TRoot> | undefined;
  readonly root: TRoot;
  readonly validators: readonly Validator<TreeState<TRoot>>[];
}

/** Input type for tree set() - tree state */
export type TreeSetInput<TRoot extends AnyTreeNodePrimitive> = TreeState<TRoot>;

/** Input type for tree update() - same as set() for trees */
export type TreeUpdateInput<TRoot extends AnyTreeNodePrimitive> = TreeState<TRoot>;

export class TreePrimitive<TRoot extends AnyTreeNodePrimitive, TRequired extends boolean = false, THasDefault extends boolean = false>
  implements Primitive<TreeState<TRoot>, TreeProxy<TRoot>, TRequired, THasDefault, TreeSetInput<TRoot>, TreeUpdateInput<TRoot>>
{
  readonly _tag = "TreePrimitive" as const;
  readonly _State!: TreeState<TRoot>;
  readonly _Proxy!: TreeProxy<TRoot>;
  readonly _TRequired!: TRequired;
  readonly _THasDefault!: THasDefault;
  readonly TSetInput!: TreeSetInput<TRoot>;
  readonly TUpdateInput!: TreeUpdateInput<TRoot>;

  private readonly _schema: TreePrimitiveSchema<TRoot>;
  private _nodeTypeRegistry: Map<string, AnyTreeNodePrimitive> | undefined;

  private readonly _opDefinitions = {
    set: OperationDefinition.make({
      kind: "tree.set" as const,
      payload: Schema.Unknown,
      target: Schema.Unknown,
      apply: (payload) => payload,
    }),
    insert: OperationDefinition.make({
      kind: "tree.insert" as const,
      payload: Schema.Unknown,
      target: Schema.Unknown,
      apply: (payload) => payload,
    }),
    remove: OperationDefinition.make({
      kind: "tree.remove" as const,
      payload: Schema.Unknown,
      target: Schema.Unknown,
      apply: (payload) => payload,
    }),
    move: OperationDefinition.make({
      kind: "tree.move" as const,
      payload: Schema.Unknown,
      target: Schema.Unknown,
      apply: (payload) => payload,
    }),
  };

  constructor(schema: TreePrimitiveSchema<TRoot>) {
    this._schema = schema;
  }

  /** Mark this tree as required */
  required(): TreePrimitive<TRoot, true, THasDefault> {
    return new TreePrimitive({
      ...this._schema,
      required: true,
    });
  }

  /** Set a default value for this tree */
  default(defaultValue: TreeState<TRoot>): TreePrimitive<TRoot, TRequired, true> {
    return new TreePrimitive({
      ...this._schema,
      defaultValue,
    });
  }

  /** Get the root node type */
  get root(): TRoot {
    return this._schema.root;
  }

  /** Add a custom validation rule */
  refine(fn: (value: TreeState<TRoot>) => boolean, message: string): TreePrimitive<TRoot, TRequired, THasDefault> {
    return new TreePrimitive({
      ...this._schema,
      validators: [...this._schema.validators, { validate: fn, message }],
    });
  }

  /**
   * Build a registry of all node types reachable from root
   */
  private _buildNodeTypeRegistry(): Map<string, AnyTreeNodePrimitive> {
    if (this._nodeTypeRegistry !== undefined) {
      return this._nodeTypeRegistry;
    }

    const registry = new Map<string, AnyTreeNodePrimitive>();
    const visited = new Set<string>();

    const visit = (node: AnyTreeNodePrimitive) => {
      if (visited.has(node.type)) return;
      visited.add(node.type);
      registry.set(node.type, node);

      for (const child of node.children) {
        visit(child);
      }
    };

    visit(this._schema.root);
    this._nodeTypeRegistry = registry;
    return registry;
  }

  /**
   * Get a node type primitive by its type string
   */
  private _getNodeTypePrimitive(type: string): AnyTreeNodePrimitive {
    const registry = this._buildNodeTypeRegistry();
    const nodeType = registry.get(type);
    if (!nodeType) {
      throw new ValidationError(`Unknown node type: ${type}`);
    }
    return nodeType;
  }

  /**
   * Validate that a node type can be a child of a parent node type
   */
  private _validateChildType(
    parentType: string | null,
    childType: string
  ): void {
    if (parentType === null) {
      // Root level - child must be the root type
      if (childType !== this._schema.root.type) {
        throw new ValidationError(
          `Root node must be of type "${this._schema.root.type}", got "${childType}"`
        );
      }
      return;
    }

    const parentNodePrimitive = this._getNodeTypePrimitive(parentType);
    if (!parentNodePrimitive.isChildAllowed(childType)) {
      const allowedTypes = parentNodePrimitive.children.map(c => c.type).join(", ");
      throw new ValidationError(
        `Node type "${childType}" is not allowed as a child of "${parentType}". ` +
        `Allowed types: ${allowedTypes || "none"}`
      );
    }
  }

  readonly _internal: PrimitiveInternal<TreeState<TRoot>, TreeProxy<TRoot>> = {
    createProxy: (
      env: ProxyEnvironment.ProxyEnvironment,
      operationPath: OperationPath.OperationPath
    ): TreeProxy<TRoot> => {
      // Helper to get current state
      const getCurrentState = (): TreeState<TRoot> => {
        const state = env.getState(operationPath) as TreeState<TRoot> | undefined;
        return state ?? [];
      };

      // Helper to get parent type from state
      const getParentType = (parentId: string | null): string | null => {
        if (parentId === null) return null;
        const state = getCurrentState();
        const parent = state.find(n => n.id === parentId);
        return parent?.type ?? null;
      };

      // Helper to create a node proxy with type narrowing
      const createNodeProxy = (nodeState: TreeNodeState): TreeNodeProxyBase<TRoot> => {
        return {
          id: nodeState.id,
          type: nodeState.type,
          
          is: <TNode extends AnyTreeNodePrimitive>(
            nodeType: TNode
          ): boolean => {
            return nodeState.type === nodeType.type;
          },
          
          as: <TNode extends AnyTreeNodePrimitive>(
            nodeType: TNode
          ): TypedNodeProxy<TNode> => {
            if (nodeState.type !== nodeType.type) {
              throw new ValidationError(
                `Node is of type "${nodeState.type}", not "${nodeType.type}"`
              );
            }
            const nodePath = operationPath.append(nodeState.id);
            const dataProxy = nodeType.data._internal.createProxy(env, nodePath) as InferProxy<TNode["data"]>;
            return {
              id: nodeState.id,
              type: nodeType.type as InferTreeNodeType<TNode>,
              data: dataProxy,
              get: () => nodeState as TypedTreeNodeState<TNode>,
              update: (value: TreeNodeUpdateValue<TNode>) => {
                // Delegate to the data proxy's update method
                (dataProxy as { update: (v: unknown) => void }).update(value);
              },
            };
          },
          
          get: () => nodeState,
        } as TreeNodeProxyBase<TRoot>;
      };

      // Helper to build recursive snapshot
      const buildSnapshot = (
        nodeId: string,
        nodes: readonly TreeNodeState[]
      ): TreeNodeSnapshot<TRoot> | undefined => {
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return undefined;

        const childNodes = getOrderedChildren(nodes, nodeId);
        const children: TreeNodeSnapshot<any>[] = [];
        for (const child of childNodes) {
          const childSnapshot = buildSnapshot(child.id, nodes);
          if (childSnapshot) {
            children.push(childSnapshot);
          }
        }

        // Spread data properties at node level
        return {
          id: node.id,
          type: node.type,
          ...(node.data as object),
          children,
        } as unknown as TreeNodeSnapshot<TRoot>;
      };

      return {
        get: (): TreeState<TRoot> => {
          return getCurrentState();
        },

        set: (nodes: TreeState<TRoot>) => {
          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.set, nodes)
          );
        },

        root: (): TypedTreeNodeState<TRoot> | undefined => {
          const state = getCurrentState();
          const rootNode = state.find(n => n.parentId === null);
          return rootNode as TypedTreeNodeState<TRoot> | undefined;
        },

        children: (parentId: string | null): TreeNodeState[] => {
          const state = getCurrentState();
          return getOrderedChildren(state, parentId);
        },

        node: (id: string): TreeNodeProxyBase<TRoot> | undefined => {
          const state = getCurrentState();
          const nodeState = state.find(n => n.id === id);
          if (!nodeState) return undefined;
          return createNodeProxy(nodeState);
        },

        insertFirst: <TNode extends AnyTreeNodePrimitive>(
          parentId: string | null,
          nodeType: TNode,
          data: TreeNodeDataSetInput<TNode>
        ): string => {
          const state = getCurrentState();
          const siblings = getOrderedChildren(state, parentId);
          const firstPos = siblings.length > 0 ? siblings[0]!.pos : null;
          const pos = generateTreePosBetween(null, firstPos);
          const id = env.generateId();

          // Validate parent exists (if not root)
          if (parentId !== null && !state.find(n => n.id === parentId)) {
            throw new ValidationError(`Parent node not found: ${parentId}`);
          }

          // Validate child type is allowed
          const parentType = getParentType(parentId);
          this._validateChildType(parentType, nodeType.type);

          // Validate single root
          if (parentId === null && state.some(n => n.parentId === null)) {
            throw new ValidationError("Tree already has a root node");
          }

          // Apply defaults to node data
          const mergedData = applyDefaults(nodeType.data as AnyPrimitive, data as Partial<InferTreeNodeDataState<TNode>>) as InferTreeNodeDataState<TNode>;

          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.insert, {
              id,
              type: nodeType.type,
              parentId,
              pos,
              data: mergedData,
            })
          );

          return id;
        },

        insertLast: <TNode extends AnyTreeNodePrimitive>(
          parentId: string | null,
          nodeType: TNode,
          data: TreeNodeDataSetInput<TNode>
        ): string => {
          const state = getCurrentState();
          const siblings = getOrderedChildren(state, parentId);
          const lastPos = siblings.length > 0 ? siblings[siblings.length - 1]!.pos : null;
          const pos = generateTreePosBetween(lastPos, null);
          const id = env.generateId();

          // Validate parent exists (if not root)
          if (parentId !== null && !state.find(n => n.id === parentId)) {
            throw new ValidationError(`Parent node not found: ${parentId}`);
          }

          // Validate child type is allowed
          const parentType = getParentType(parentId);
          this._validateChildType(parentType, nodeType.type);

          // Validate single root
          if (parentId === null && state.some(n => n.parentId === null)) {
            throw new ValidationError("Tree already has a root node");
          }

          // Apply defaults to node data
          const mergedData = applyDefaults(nodeType.data as AnyPrimitive, data as Partial<InferTreeNodeDataState<TNode>>) as InferTreeNodeDataState<TNode>;

          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.insert, {
              id,
              type: nodeType.type,
              parentId,
              pos,
              data: mergedData,
            })
          );

          return id;
        },

        insertAt: <TNode extends AnyTreeNodePrimitive>(
          parentId: string | null,
          index: number,
          nodeType: TNode,
          data: TreeNodeDataSetInput<TNode>
        ): string => {
          const state = getCurrentState();
          const siblings = getOrderedChildren(state, parentId);
          const clampedIndex = Math.max(0, Math.min(index, siblings.length));
          const leftPos = clampedIndex > 0 && siblings[clampedIndex - 1] ? siblings[clampedIndex - 1]!.pos : null;
          const rightPos = clampedIndex < siblings.length && siblings[clampedIndex] ? siblings[clampedIndex]!.pos : null;
          const pos = generateTreePosBetween(leftPos, rightPos);
          const id = env.generateId();

          // Validate parent exists (if not root)
          if (parentId !== null && !state.find(n => n.id === parentId)) {
            throw new ValidationError(`Parent node not found: ${parentId}`);
          }

          // Validate child type is allowed
          const parentType = getParentType(parentId);
          this._validateChildType(parentType, nodeType.type);

          // Validate single root
          if (parentId === null && state.some(n => n.parentId === null)) {
            throw new ValidationError("Tree already has a root node");
          }

          // Apply defaults to node data
          const mergedData = applyDefaults(nodeType.data as AnyPrimitive, data as Partial<InferTreeNodeDataState<TNode>>) as InferTreeNodeDataState<TNode>;

          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.insert, {
              id,
              type: nodeType.type,
              parentId,
              pos,
              data: mergedData,
            })
          );

          return id;
        },

        insertAfter: <TNode extends AnyTreeNodePrimitive>(
          siblingId: string,
          nodeType: TNode,
          data: TreeNodeDataSetInput<TNode>
        ): string => {
          const state = getCurrentState();
          const sibling = state.find(n => n.id === siblingId);
          if (!sibling) {
            throw new ValidationError(`Sibling node not found: ${siblingId}`);
          }

          const parentId = sibling.parentId;
          const siblings = getOrderedChildren(state, parentId);
          const siblingIndex = siblings.findIndex(n => n.id === siblingId);
          const nextSibling = siblings[siblingIndex + 1];
          const pos = generateTreePosBetween(sibling.pos, nextSibling?.pos ?? null);
          const id = env.generateId();

          // Validate child type is allowed
          const parentType = getParentType(parentId);
          this._validateChildType(parentType, nodeType.type);

          // Apply defaults to node data
          const mergedData = applyDefaults(nodeType.data as AnyPrimitive, data as Partial<InferTreeNodeDataState<TNode>>) as InferTreeNodeDataState<TNode>;

          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.insert, {
              id,
              type: nodeType.type,
              parentId,
              pos,
              data: mergedData,
            })
          );

          return id;
        },

        insertBefore: <TNode extends AnyTreeNodePrimitive>(
          siblingId: string,
          nodeType: TNode,
          data: TreeNodeDataSetInput<TNode>
        ): string => {
          const state = getCurrentState();
          const sibling = state.find(n => n.id === siblingId);
          if (!sibling) {
            throw new ValidationError(`Sibling node not found: ${siblingId}`);
          }

          const parentId = sibling.parentId;
          const siblings = getOrderedChildren(state, parentId);
          const siblingIndex = siblings.findIndex(n => n.id === siblingId);
          const prevSibling = siblings[siblingIndex - 1];
          const pos = generateTreePosBetween(prevSibling?.pos ?? null, sibling.pos);
          const id = env.generateId();

          // Validate child type is allowed
          const parentType = getParentType(parentId);
          this._validateChildType(parentType, nodeType.type);

          // Apply defaults to node data
          const mergedData = applyDefaults(nodeType.data as AnyPrimitive, data as Partial<InferTreeNodeDataState<TNode>>) as InferTreeNodeDataState<TNode>;

          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.insert, {
              id,
              type: nodeType.type,
              parentId,
              pos,
              data: mergedData,
            })
          );

          return id;
        },

        remove: (id: string) => {
          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.remove, { id })
          );
        },

        move: (nodeId: string, newParentId: string | null, toIndex: number) => {
          const state = getCurrentState();
          const node = state.find(n => n.id === nodeId);
          if (!node) {
            throw new ValidationError(`Node not found: ${nodeId}`);
          }

          // Validate parent exists (if not moving to root)
          if (newParentId !== null && !state.find(n => n.id === newParentId)) {
            throw new ValidationError(`Parent node not found: ${newParentId}`);
          }

          // Validate no cycle
          if (wouldCreateCycle(state, nodeId, newParentId)) {
            throw new ValidationError("Move would create a cycle in the tree");
          }

          // Validate child type is allowed in new parent
          const newParentType = newParentId === null ? null : state.find(n => n.id === newParentId)?.type ?? null;
          this._validateChildType(newParentType, node.type);

          // Validate not moving root to a parent
          if (node.parentId === null && newParentId !== null) {
            throw new ValidationError("Cannot move root node to have a parent");
          }

          // Calculate new position among new siblings (excluding self)
          const siblings = getOrderedChildren(state, newParentId).filter(n => n.id !== nodeId);
          const clampedIndex = Math.max(0, Math.min(toIndex, siblings.length));
          const leftPos = clampedIndex > 0 && siblings[clampedIndex - 1] ? siblings[clampedIndex - 1]!.pos : null;
          const rightPos = clampedIndex < siblings.length && siblings[clampedIndex] ? siblings[clampedIndex]!.pos : null;
          const pos = generateTreePosBetween(leftPos, rightPos);

          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.move, {
              id: nodeId,
              parentId: newParentId,
              pos,
            })
          );
        },

        moveAfter: (nodeId: string, siblingId: string) => {
          const state = getCurrentState();
          const node = state.find(n => n.id === nodeId);
          const sibling = state.find(n => n.id === siblingId);
          
          if (!node) {
            throw new ValidationError(`Node not found: ${nodeId}`);
          }
          if (!sibling) {
            throw new ValidationError(`Sibling node not found: ${siblingId}`);
          }

          const newParentId = sibling.parentId;

          // Validate no cycle
          if (wouldCreateCycle(state, nodeId, newParentId)) {
            throw new ValidationError("Move would create a cycle in the tree");
          }

          // Validate child type is allowed in new parent
          const newParentType = newParentId === null ? null : state.find(n => n.id === newParentId)?.type ?? null;
          this._validateChildType(newParentType, node.type);

          // Validate not moving root to a parent
          if (node.parentId === null && newParentId !== null) {
            throw new ValidationError("Cannot move root node to have a parent");
          }

          const siblings = getOrderedChildren(state, newParentId).filter(n => n.id !== nodeId);
          const siblingIndex = siblings.findIndex(n => n.id === siblingId);
          const nextSibling = siblings[siblingIndex + 1];
          const pos = generateTreePosBetween(sibling.pos, nextSibling?.pos ?? null);

          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.move, {
              id: nodeId,
              parentId: newParentId,
              pos,
            })
          );
        },

        moveBefore: (nodeId: string, siblingId: string) => {
          const state = getCurrentState();
          const node = state.find(n => n.id === nodeId);
          const sibling = state.find(n => n.id === siblingId);
          
          if (!node) {
            throw new ValidationError(`Node not found: ${nodeId}`);
          }
          if (!sibling) {
            throw new ValidationError(`Sibling node not found: ${siblingId}`);
          }

          const newParentId = sibling.parentId;

          // Validate no cycle
          if (wouldCreateCycle(state, nodeId, newParentId)) {
            throw new ValidationError("Move would create a cycle in the tree");
          }

          // Validate child type is allowed in new parent
          const newParentType = newParentId === null ? null : state.find(n => n.id === newParentId)?.type ?? null;
          this._validateChildType(newParentType, node.type);

          // Validate not moving root to a parent
          if (node.parentId === null && newParentId !== null) {
            throw new ValidationError("Cannot move root node to have a parent");
          }

          const siblings = getOrderedChildren(state, newParentId).filter(n => n.id !== nodeId);
          const siblingIndex = siblings.findIndex(n => n.id === siblingId);
          const prevSibling = siblings[siblingIndex - 1];
          const pos = generateTreePosBetween(prevSibling?.pos ?? null, sibling.pos);

          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.move, {
              id: nodeId,
              parentId: newParentId,
              pos,
            })
          );
        },

        moveToFirst: (nodeId: string, newParentId: string | null) => {
          const state = getCurrentState();
          const node = state.find(n => n.id === nodeId);
          
          if (!node) {
            throw new ValidationError(`Node not found: ${nodeId}`);
          }

          // Validate parent exists (if not moving to root)
          if (newParentId !== null && !state.find(n => n.id === newParentId)) {
            throw new ValidationError(`Parent node not found: ${newParentId}`);
          }

          // Validate no cycle
          if (wouldCreateCycle(state, nodeId, newParentId)) {
            throw new ValidationError("Move would create a cycle in the tree");
          }

          // Validate child type is allowed in new parent
          const newParentType = newParentId === null ? null : state.find(n => n.id === newParentId)?.type ?? null;
          this._validateChildType(newParentType, node.type);

          // Validate not moving root to a parent
          if (node.parentId === null && newParentId !== null) {
            throw new ValidationError("Cannot move root node to have a parent");
          }

          const siblings = getOrderedChildren(state, newParentId).filter(n => n.id !== nodeId);
          const firstPos = siblings.length > 0 ? siblings[0]!.pos : null;
          const pos = generateTreePosBetween(null, firstPos);

          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.move, {
              id: nodeId,
              parentId: newParentId,
              pos,
            })
          );
        },

        moveToLast: (nodeId: string, newParentId: string | null) => {
          const state = getCurrentState();
          const node = state.find(n => n.id === nodeId);
          
          if (!node) {
            throw new ValidationError(`Node not found: ${nodeId}`);
          }

          // Validate parent exists (if not moving to root)
          if (newParentId !== null && !state.find(n => n.id === newParentId)) {
            throw new ValidationError(`Parent node not found: ${newParentId}`);
          }

          // Validate no cycle
          if (wouldCreateCycle(state, nodeId, newParentId)) {
            throw new ValidationError("Move would create a cycle in the tree");
          }

          // Validate child type is allowed in new parent
          const newParentType = newParentId === null ? null : state.find(n => n.id === newParentId)?.type ?? null;
          this._validateChildType(newParentType, node.type);

          // Validate not moving root to a parent
          if (node.parentId === null && newParentId !== null) {
            throw new ValidationError("Cannot move root node to have a parent");
          }

          const siblings = getOrderedChildren(state, newParentId).filter(n => n.id !== nodeId);
          const lastPos = siblings.length > 0 ? siblings[siblings.length - 1]!.pos : null;
          const pos = generateTreePosBetween(lastPos, null);

          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.move, {
              id: nodeId,
              parentId: newParentId,
              pos,
            })
          );
        },

        at: <TNode extends AnyTreeNodePrimitive>(
          id: string,
          nodeType: TNode
        ): InferProxy<TNode["data"]> => {
          // Get the node to verify its type
          const state = getCurrentState();
          const node = state.find(n => n.id === id);
          if (!node) {
            throw new ValidationError(`Node not found: ${id}`);
          }
          if (node.type !== nodeType.type) {
            throw new ValidationError(
              `Node is of type "${node.type}", not "${nodeType.type}"`
            );
          }

          const nodePath = operationPath.append(id);
          return nodeType.data._internal.createProxy(env, nodePath) as InferProxy<TNode["data"]>;
        },

        updateAt: <TNode extends AnyTreeNodePrimitive>(
          id: string,
          nodeType: TNode,
          value: TreeNodeUpdateValue<TNode>
        ): void => {
          // Get the node to verify its type
          const state = getCurrentState();
          const node = state.find(n => n.id === id);
          if (!node) {
            throw new ValidationError(`Node not found: ${id}`);
          }
          if (node.type !== nodeType.type) {
            throw new ValidationError(
              `Node is of type "${node.type}", not "${nodeType.type}"`
            );
          }

          const nodePath = operationPath.append(id);
          const dataProxy = nodeType.data._internal.createProxy(env, nodePath);
          // Delegate to the data proxy's update method
          (dataProxy as { update: (v: unknown) => void }).update(value);
        },

        toSnapshot: (): TreeNodeSnapshot<TRoot> | undefined => {
          const state = getCurrentState();
          const rootNode = state.find(n => n.parentId === null);
          if (!rootNode) return undefined;
          return buildSnapshot(rootNode.id, state);
        },
      };
    },

    applyOperation: (
      state: TreeState<TRoot> | undefined,
      operation: Operation.Operation<any, any, any>
    ): TreeState<TRoot> => {
      const path = operation.path;
      const tokens = path.toTokens().filter((t: string) => t !== "");
      const currentState = state ?? [];

      let newState: TreeState<TRoot>;

      // If path is empty, this is a tree-level operation
      if (tokens.length === 0) {
        switch (operation.kind) {
          case "tree.set": {
            const payload = operation.payload;
            if (!globalThis.Array.isArray(payload)) {
              throw new ValidationError(`TreePrimitive.set requires an array payload`);
            }
            newState = payload as TreeState<TRoot>;
            break;
          }
          case "tree.insert": {
            const { id, type, parentId, pos, data } = operation.payload as {
              id: string;
              type: string;
              parentId: string | null;
              pos: string;
              data: unknown;
            };
            newState = [...currentState, { id, type, parentId, pos, data }] as TreeState<TRoot>;
            break;
          }
          case "tree.remove": {
            const { id } = operation.payload as { id: string };
            // Get all descendants to remove
            const descendantIds = getDescendantIds(currentState, id);
            const idsToRemove = new Set([id, ...descendantIds]);
            newState = currentState.filter(node => !idsToRemove.has(node.id));
            break;
          }
          case "tree.move": {
            const { id, parentId, pos } = operation.payload as {
              id: string;
              parentId: string | null;
              pos: string;
            };
            newState = currentState.map(node =>
              node.id === id ? { ...node, parentId, pos } : node
            ) as TreeState<TRoot>;
            break;
          }
          default:
            throw new ValidationError(`TreePrimitive cannot apply operation of kind: ${operation.kind}`);
        }
      } else {
        // Otherwise, delegate to the node's data primitive
        const nodeId = tokens[0]!;
        const nodeIndex = currentState.findIndex(node => node.id === nodeId);
        
        if (nodeIndex === -1) {
          throw new ValidationError(`Tree node not found with ID: ${nodeId}`);
        }

        const node = currentState[nodeIndex]!;
        const nodeTypePrimitive = this._getNodeTypePrimitive(node.type);
        const remainingPath = path.shift();
        const nodeOperation = {
          ...operation,
          path: remainingPath,
        };

        const newData = nodeTypePrimitive.data._internal.applyOperation(
          node.data as InferStructState<any> | undefined,
          nodeOperation
        );

        const mutableState = [...currentState];
        mutableState[nodeIndex] = { ...node, data: newData };
        newState = mutableState as TreeState<TRoot>;
      }

      // Run validators on the new state
      runValidators(newState, this._schema.validators);

      return newState;
    },

    getInitialState: (): TreeState<TRoot> | undefined => {
      if (this._schema.defaultValue !== undefined) {
        return this._schema.defaultValue;
      }

      // Automatically create a root node with default data
      const rootNodeType = this._schema.root;
      const rootData = rootNodeType.data._internal.getInitialState() ?? {};
      const rootId = crypto.randomUUID();
      const rootPos = generateTreePosBetween(null, null);

      return [{
        id: rootId,
        type: rootNodeType.type,
        parentId: null,
        pos: rootPos,
        data: rootData,
      }] as TreeState<TRoot>;
    },

    transformOperation: (
      clientOp: Operation.Operation<any, any, any>,
      serverOp: Operation.Operation<any, any, any>
    ): Transform.TransformResult => {
      const clientPath = clientOp.path;
      const serverPath = serverOp.path;

      // If paths don't overlap at all, no transformation needed
      if (!OperationPath.pathsOverlap(clientPath, serverPath)) {
        return { type: "transformed", operation: clientOp };
      }

      // Handle tree.remove from server - check if client is operating on removed node or descendants
      if (serverOp.kind === "tree.remove") {
        const removedId = (serverOp.payload as { id: string }).id;
        const clientTokens = clientPath.toTokens().filter((t: string) => t !== "");
        const serverTokens = serverPath.toTokens().filter((t: string) => t !== "");

        // Check if client operation targets the removed node or uses it
        if (clientOp.kind === "tree.move") {
          const movePayload = clientOp.payload as { id: string; parentId: string | null };
          // If moving the removed node or moving to a removed parent
          if (movePayload.id === removedId || movePayload.parentId === removedId) {
            return { type: "noop" };
          }
        }

        if (clientOp.kind === "tree.insert") {
          const insertPayload = clientOp.payload as { parentId: string | null };
          // If inserting into a removed parent
          if (insertPayload.parentId === removedId) {
            return { type: "noop" };
          }
        }

        // Check if client is operating on a node that was removed
        if (clientTokens.length > serverTokens.length) {
          const nodeId = clientTokens[serverTokens.length];
          if (nodeId === removedId) {
            return { type: "noop" };
          }
        }
      }

      // Both inserting - no conflict (fractional indexing handles order)
      if (serverOp.kind === "tree.insert" && clientOp.kind === "tree.insert") {
        return { type: "transformed", operation: clientOp };
      }

      // Both moving same node - client wins
      if (serverOp.kind === "tree.move" && clientOp.kind === "tree.move") {
        const serverMoveId = (serverOp.payload as { id: string }).id;
        const clientMoveId = (clientOp.payload as { id: string }).id;

        if (serverMoveId === clientMoveId) {
          return { type: "transformed", operation: clientOp };
        }
        // Different nodes - no conflict
        return { type: "transformed", operation: clientOp };
      }

      // For same exact path: client wins (last-write-wins)
      if (OperationPath.pathsEqual(clientPath, serverPath)) {
        return { type: "transformed", operation: clientOp };
      }

      // If server set entire tree and client is operating on a node
      if (serverOp.kind === "tree.set" && OperationPath.isPrefix(serverPath, clientPath)) {
        return { type: "transformed", operation: clientOp };
      }

      // Delegate to node data primitive for nested operations
      const clientTokens = clientPath.toTokens().filter((t: string) => t !== "");
      const serverTokens = serverPath.toTokens().filter((t: string) => t !== "");

      // Both operations target children of this tree
      if (clientTokens.length > 0 && serverTokens.length > 0) {
        const clientNodeId = clientTokens[0];
        const serverNodeId = serverTokens[0];

        // If operating on different nodes, no conflict
        if (clientNodeId !== serverNodeId) {
          return { type: "transformed", operation: clientOp };
        }

        // Same node - would need to delegate to node's data primitive
        // For simplicity, let client win
        return { type: "transformed", operation: clientOp };
      }

      // Default: no transformation needed
      return { type: "transformed", operation: clientOp };
    },
  };
}

/** Options for creating a Tree primitive */
export interface TreeOptions<TRoot extends AnyTreeNodePrimitive> {
  /** The root node type */
  readonly root: TRoot;
}

/** Creates a new TreePrimitive with the given root node type */
export const Tree = <TRoot extends AnyTreeNodePrimitive>(
  options: TreeOptions<TRoot>
): TreePrimitive<TRoot, false, false> =>
  new TreePrimitive({
    required: false,
    defaultValue: undefined,
    root: options.root,
    validators: [],
  });
