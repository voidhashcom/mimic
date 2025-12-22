import type { InferState } from "../Primitive";
import { StructPrimitive } from "./Struct";

/**
 * Symbol used to identify the Self placeholder
 */
const TreeNodeSelfSymbol = Symbol.for("TreeNode.Self");

/**
 * Branded type for TreeNodeSelf - distinguishable at compile time
 */
declare const SelfBrand: unique symbol;
export interface TreeNodeSelfType {
  readonly _tag: "TreeNodeSelf";
  readonly _brand: typeof SelfBrand;
}

/**
 * Special placeholder for self-referential tree nodes.
 * Use this in the children array when a node type can contain itself.
 * 
 * @example
 * ```typescript
 * const FolderNode = TreeNode("folder", {
 *   data: Struct({ name: String() }),
 *   children: [TreeNodeSelf], // Folder can contain other folders
 * });
 * ```
 */
export const TreeNodeSelf: TreeNodeSelfType = { _tag: "TreeNodeSelf", _symbol: TreeNodeSelfSymbol } as unknown as TreeNodeSelfType;

/**
 * Check if a value is the Self placeholder
 */
const isSelf = (value: unknown): boolean => {
  return typeof value === "object" && value !== null && "_symbol" in value && (value as any)._symbol === TreeNodeSelfSymbol;
};

/**
 * Type utility to resolve Self placeholders to the actual node type
 */
type ResolveSelf<T, TSelf extends AnyTreeNodePrimitive> = 
  T extends TreeNodeSelfType ? TSelf : T;

/**
 * Type utility to resolve all children in a tuple, replacing Self with the node type
 */
type ResolveChildrenUnion<TChildren, TSelf extends AnyTreeNodePrimitive> = 
  TChildren extends readonly (infer U)[] 
    ? ResolveSelf<U, TSelf> 
    : never;

/**
 * The type for children - either a direct array or a lazy function (for self-referential nodes).
 */
export type TreeNodeChildrenInput = readonly (AnyTreeNodePrimitive | TreeNodeSelfType)[] | (() => readonly (AnyTreeNodePrimitive | TreeNodeSelfType)[]);

/**
 * Any TreeNodePrimitive type - used for generic constraints.
 */
export type AnyTreeNodePrimitive = TreeNodePrimitive<string, StructPrimitive<any>, any>;

/**
 * Infer the data state type from a TreeNodePrimitive
 */
export type InferTreeNodeDataState<T extends AnyTreeNodePrimitive> = 
  T extends TreeNodePrimitive<any, infer TData, any> ? InferState<TData> : never;

/**
 * Infer the type literal from a TreeNodePrimitive
 */
export type InferTreeNodeType<T extends AnyTreeNodePrimitive> =
  T extends TreeNodePrimitive<infer TType, any, any> ? TType : never;

/**
 * Infer the allowed children from a TreeNodePrimitive
 */
export type InferTreeNodeChildren<T> = 
  T extends TreeNodePrimitive<any, any, infer TChildren> ? TChildren : never;

/**
 * Configuration for a TreeNode primitive
 */
export interface TreeNodeConfig<
  TData extends StructPrimitive<any>,
  TChildren extends readonly (AnyTreeNodePrimitive | TreeNodeSelfType)[]
> {
  readonly data: TData;
  readonly children: TChildren | (() => TChildren);
}

/**
 * TreeNodePrimitive - defines a node type with its data schema and allowed children
 */
export class TreeNodePrimitive<
  TType extends string,
  TData extends StructPrimitive<any>,
  TChildren extends AnyTreeNodePrimitive = AnyTreeNodePrimitive
> {
  readonly _tag = "TreeNodePrimitive" as const;
  readonly _Type!: TType;
  readonly _Data!: TData;
  readonly _Children!: TChildren;

  private readonly _type: TType;
  private readonly _data: TData;
  private readonly _children: TreeNodeChildrenInput;
  private _resolvedChildren: readonly AnyTreeNodePrimitive[] | undefined;

  constructor(type: TType, config: TreeNodeConfig<TData, readonly (AnyTreeNodePrimitive | TreeNodeSelfType)[]>) {
    this._type = type;
    this._data = config.data;
    this._children = config.children;
  }

  /** Get the node type identifier */
  get type(): TType {
    return this._type;
  }

  /** Get the data primitive */
  get data(): TData {
    return this._data;
  }

  /** Get resolved children (resolves lazy thunk if needed, replaces Self with this node) */
  get children(): readonly AnyTreeNodePrimitive[] {
    if (this._resolvedChildren === undefined) {
      const resolved = typeof this._children === "function"
        ? (this._children as () => readonly AnyTreeNodePrimitive[])()
        : this._children;
      // Replace Self placeholders with this node
      this._resolvedChildren = resolved.map(child => isSelf(child) ? this : child) as readonly AnyTreeNodePrimitive[];
    }
    return this._resolvedChildren;
  }

  /** Check if a child type is allowed */
  isChildAllowed(childType: string): boolean {
    return this.children.some(child => child.type === childType);
  }
}

/** Creates a new TreeNodePrimitive with the given type and config */
export const TreeNode = <
  TType extends string,
  TData extends StructPrimitive<any>,
  const TChildren extends readonly (AnyTreeNodePrimitive | TreeNodeSelfType)[]
>(
  type: TType,
  config: TreeNodeConfig<TData, TChildren>
): TreeNodePrimitive<TType, TData, ResolveChildrenUnion<TChildren, TreeNodePrimitive<TType, TData, any>>> =>
  new TreeNodePrimitive(type, config) as TreeNodePrimitive<TType, TData, ResolveChildrenUnion<TChildren, TreeNodePrimitive<TType, TData, any>>>;

