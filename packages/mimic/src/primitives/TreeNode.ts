import { Effect, Schema } from "effect";
import * as OperationDefinition from "../OperationDefinition";
import * as Operation from "../Operation";
import * as OperationPath from "../OperationPath";
import * as ProxyEnvironment from "../ProxyEnvironment";
import * as Transform from "../Transform";
import type { AnyPrimitive, InferState } from "../Primitive";
import { StructPrimitive } from "./Struct";


/**
 * Any TreeNodePrimitive type - used for generic constraints.
 */
export type AnyTreeNodePrimitive = TreeNodePrimitive<string, StructPrimitive<any>, readonly AnyTreeNodePrimitive[] | (() => readonly AnyTreeNodePrimitive[])>;

/**
 * Resolves children type - handles both array and lazy thunk
 */
export type ResolveChildren<TChildren extends readonly AnyTreeNodePrimitive[] | (() => readonly AnyTreeNodePrimitive[])> =
  TChildren extends () => readonly AnyTreeNodePrimitive[] ? ReturnType<TChildren> : TChildren;

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
export type InferTreeNodeChildren<T extends AnyTreeNodePrimitive> =
  T extends TreeNodePrimitive<any, any, infer TChildren> ? ResolveChildren<TChildren>[number] : never;

/**
 * Configuration for a TreeNode primitive
 */
export interface TreeNodeConfig<
  TData extends StructPrimitive<any>,
  TChildren extends readonly AnyTreeNodePrimitive[] | (() => readonly AnyTreeNodePrimitive[])
> {
  readonly data: TData;
  readonly children: TChildren;
}

/**
 * TreeNodePrimitive - defines a node type with its data schema and allowed children
 */
export class TreeNodePrimitive<
  TType extends string,
  TData extends StructPrimitive<any>,
  TChildren extends readonly AnyTreeNodePrimitive[] | (() => readonly AnyTreeNodePrimitive[])
> {
  readonly _tag = "TreeNodePrimitive" as const;
  readonly _Type!: TType;
  readonly _Data!: TData;
  readonly _Children!: TChildren;

  private readonly _type: TType;
  private readonly _data: TData;
  private readonly _children: TChildren;
  private _resolvedChildren: readonly AnyTreeNodePrimitive[] | undefined;

  constructor(type: TType, config: TreeNodeConfig<TData, TChildren>) {
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

  /** Get resolved children (resolves lazy thunk if needed) */
  get children(): readonly AnyTreeNodePrimitive[] {
    if (this._resolvedChildren === undefined) {
      if (typeof this._children === "function") {
        this._resolvedChildren = (this._children as () => readonly AnyTreeNodePrimitive[])();
      } else {
        this._resolvedChildren = this._children as readonly AnyTreeNodePrimitive[];
      }
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
  TChildren extends readonly AnyTreeNodePrimitive[] | (() => readonly AnyTreeNodePrimitive[])
>(
  type: TType,
  config: TreeNodeConfig<TData, TChildren>
): TreeNodePrimitive<TType, TData, TChildren> =>
  new TreeNodePrimitive(type, config);

