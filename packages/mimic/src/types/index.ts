/**
 * Consolidated type inference utilities for all primitives.
 *
 * This module re-exports all inference types from a single location
 * for convenient access across the mimic package.
 *
 * @since 0.0.1
 */

// =============================================================================
// Core Inference Types (from shared.ts)
// =============================================================================

export type {
  // Core primitive types
  Primitive,
  AnyPrimitive,
  PrimitiveInternal,

  // State and proxy inference
  InferState,
  InferProxy,

  // Input inference
  InferSetInput,
  InferUpdateInput,

  // Snapshot inference
  InferSnapshot,

  // Required/default status inference
  HasDefault,
  IsDefined,
  IsRequired,

  // Utility types
  MaybeUndefined,
  NeedsValue,
  Optional,

  // Validator type
  Validator,
} from "../primitives/shared";

// =============================================================================
// Struct Inference Types
// =============================================================================

export type {
  InferStructState,
  InferStructSnapshot,
  StructSetInput,
  StructUpdateValue,
  StructProxy,
} from "../primitives/Struct";

// =============================================================================
// Array Inference Types
// =============================================================================

export type {
  ArrayState,
  ArraySnapshot,
  ArrayEntrySnapshot,
  ArrayEntry,
  ArraySetInput,
  ArrayUpdateInput,
  ArrayElementSetInput,
  ArrayProxy,
} from "../primitives/Array";

// =============================================================================
// Tree Inference Types
// =============================================================================

export type {
  TreeState,
  TreeNodeState,
  TypedTreeNodeState,
  TreeNodeSnapshot,
  InferTreeSnapshot,
  TreeSetInput,
  TreeUpdateInput,
  TreeNodeUpdateValue,
  TreeNodeDataSetInput,
  TreeProxy,
  TypedNodeProxy,
  TreeNodeProxyBase,
} from "../primitives/Tree";

// =============================================================================
// TreeNode Inference Types
// =============================================================================

export type {
  AnyTreeNodePrimitive,
  InferTreeNodeDataState,
  InferTreeNodeType,
  InferTreeNodeChildren,
  TreeNodeSelfType,
  TreeNodeConfig,
  TreeNodeChildrenInput,
} from "../primitives/TreeNode";

export { TreeNodePrimitive, TreeNodeSelf } from "../primitives/TreeNode";

// =============================================================================
// Union Inference Types
// =============================================================================

export type {
  InferUnionState,
  InferUnionSnapshot,
  UnionVariants,
} from "../primitives/Union";

// =============================================================================
// Either Inference Types
// =============================================================================

export type {
  InferEitherState,
  InferEitherSnapshot,
  ScalarPrimitive,
} from "../primitives/Either";

// =============================================================================
// Lazy Inference Types
// =============================================================================

export type {
  InferLazyState,
  InferLazyProxy,
  InferLazySnapshot,
  InferLazySetInput,
  InferLazyUpdateInput,
} from "../primitives/Lazy";
