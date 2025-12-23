/**
 * Effect.Schema utilities for converting Mimic primitives to Effect.Schema schemas.
 * 
 * @since 0.0.1
 */
import { Schema } from "effect";
import type { AnyPrimitive, InferSetInput, InferUpdateInput } from "./primitives/shared";
import type { LiteralPrimitive, LiteralValue } from "./primitives/Literal";
import type { StructPrimitive } from "./primitives/Struct";
import type { ArrayPrimitive } from "./primitives/Array";
import type { UnionPrimitive, UnionVariants } from "./primitives/Union";
import type { EitherPrimitive, ScalarPrimitive } from "./primitives/Either";
import type { LazyPrimitive } from "./primitives/Lazy";
import type { TreeNodePrimitive, AnyTreeNodePrimitive } from "./primitives/TreeNode";

// =============================================================================
// Type-level Schema Inference
// =============================================================================

/**
 * Infer the Effect.Schema type for a primitive's set input.
 */
export type ToSetSchema<T extends AnyPrimitive> = Schema.Schema<InferSetInput<T>>;

/**
 * Infer the Effect.Schema type for a primitive's update input.
 */
export type ToUpdateSchema<T extends AnyPrimitive> = Schema.Schema<InferUpdateInput<T>>;

/**
 * Type for TreeNode set schema - uses the node's data set input type
 */
export type ToTreeNodeSetSchema<T extends AnyTreeNodePrimitive> = Schema.Schema<InferSetInput<T["data"]>>;

/**
 * Type for TreeNode update schema - uses the node's data update input type
 */
export type ToTreeNodeUpdateSchema<T extends AnyTreeNodePrimitive> = Schema.Schema<InferUpdateInput<T["data"]>>;

// =============================================================================
// Schema for TreeNodeState
// =============================================================================

/**
 * Schema for a tree node state (flat storage format).
 */
export const TreeNodeStateSchema = Schema.Struct({
  id: Schema.String,
  type: Schema.String,
  parentId: Schema.NullOr(Schema.String),
  pos: Schema.String,
  data: Schema.Unknown,
});

// =============================================================================
// Internal type for primitives (including those that don't implement full Primitive interface)
// =============================================================================

/**
 * Internal type for anything that can be converted to a schema.
 * This includes both AnyPrimitive and AnyTreeNodePrimitive.
 */
type ConvertiblePrimitive = { _tag: string };

// =============================================================================
// Runtime Conversion Functions
// =============================================================================

/**
 * Check if a field is required for set operations.
 * A field is required if: TRequired is true AND THasDefault is false.
 * 
 * We determine this by checking the primitive's schema properties.
 */
function isRequiredForSet(primitive: ConvertiblePrimitive): boolean {
  // Access the private schema to check required and default status
  const schema = (primitive as any)._schema;
  if (!schema) return false;
  
  return schema.required === true && schema.defaultValue === undefined;
}

/**
 * Get the base Effect.Schema for a primitive type (without optional wrapper).
 */
function getBaseSchema(primitive: ConvertiblePrimitive): Schema.Schema<any> {
  switch (primitive._tag) {
    case "StringPrimitive":
      return Schema.String;
    
    case "NumberPrimitive":
      return Schema.Number;
    
    case "BooleanPrimitive":
      return Schema.Boolean;
    
    case "LiteralPrimitive": {
      const literalPrimitive = primitive as unknown as LiteralPrimitive<LiteralValue, any, any>;
      const literalValue = (literalPrimitive as any)._schema?.literal ?? (literalPrimitive as any).literal;
      return Schema.Literal(literalValue);
    }
    
    case "StructPrimitive": {
      const structPrimitive = primitive as unknown as StructPrimitive<Record<string, AnyPrimitive>, any, any>;
      return buildStructSetSchema(structPrimitive);
    }
    
    case "ArrayPrimitive": {
      const arrayPrimitive = primitive as unknown as ArrayPrimitive<AnyPrimitive, any, any>;
      const elementSchema = buildElementSetSchema(arrayPrimitive.element);
      return Schema.Array(elementSchema);
    }
    
    case "UnionPrimitive": {
      const unionPrimitive = primitive as unknown as UnionPrimitive<UnionVariants, any, any, any>;
      return buildUnionSetSchema(unionPrimitive);
    }
    
    case "EitherPrimitive": {
      const eitherPrimitive = primitive as unknown as EitherPrimitive<readonly ScalarPrimitive[], any, any>;
      return buildEitherSchema(eitherPrimitive);
    }
    
    case "LazyPrimitive": {
      const lazyPrimitive = primitive as unknown as LazyPrimitive<() => AnyPrimitive>;
      // Resolve the lazy primitive and get its schema
      const resolved = (lazyPrimitive as any)._resolve?.() ?? (lazyPrimitive as any)._thunk();
      return getBaseSchema(resolved);
    }
    
    case "TreeNodePrimitive": {
      const treeNodePrimitive = primitive as unknown as TreeNodePrimitive<string, StructPrimitive<any>, any>;
      // TreeNode delegates to its data struct
      return buildStructSetSchema(treeNodePrimitive.data);
    }
    
    case "TreePrimitive": {
      // Tree returns an array of TreeNodeState
      return Schema.Array(TreeNodeStateSchema);
    }
    
    default:
      return Schema.Unknown;
  }
}

/**
 * Build the set schema for a struct primitive.
 * Required fields (required=true, no default) are non-optional.
 * Other fields are wrapped with Schema.optional.
 */
function buildStructSetSchema(structPrimitive: StructPrimitive<Record<string, AnyPrimitive>, any, any>): Schema.Schema<any> {
  const fields = structPrimitive.fields;
  // Use any to avoid complex Schema type constraints
  const schemaFields: Record<string, any> = {};
  
  for (const key in fields) {
    const fieldPrimitive = fields[key]!;
    const baseSchema = getBaseSchema(fieldPrimitive);
    
    if (isRequiredForSet(fieldPrimitive)) {
      // Required field - use base schema directly
      schemaFields[key] = baseSchema;
    } else {
      // Optional field - wrap with Schema.optional
      schemaFields[key] = Schema.optional(baseSchema);
    }
  }
  
  return Schema.Struct(schemaFields) as any;
}

/**
 * Build the update schema for a struct primitive.
 * All fields are optional for partial updates.
 */
function buildStructUpdateSchema(structPrimitive: StructPrimitive<Record<string, AnyPrimitive>, any, any>): Schema.Schema<any> {
  const fields = structPrimitive.fields;
  // Use any to avoid complex Schema type constraints
  const schemaFields: Record<string, any> = {};
  
  for (const key in fields) {
    const fieldPrimitive = fields[key]!;
    // For update, use the update schema for nested structs, otherwise base schema
    let fieldSchema: Schema.Schema<any>;
    
    if (fieldPrimitive._tag === "StructPrimitive") {
      fieldSchema = buildStructUpdateSchema(fieldPrimitive as StructPrimitive<Record<string, AnyPrimitive>, any, any>);
    } else {
      fieldSchema = getBaseSchema(fieldPrimitive);
    }
    
    // All fields are optional in update
    schemaFields[key] = Schema.optional(fieldSchema);
  }
  
  return Schema.Struct(schemaFields) as any;
}

/**
 * Build the set schema for an array element.
 * For struct elements, uses the struct's set input schema.
 */
function buildElementSetSchema(elementPrimitive: AnyPrimitive): Schema.Schema<any> {
  if (elementPrimitive._tag === "StructPrimitive") {
    return buildStructSetSchema(elementPrimitive as StructPrimitive<Record<string, AnyPrimitive>, any, any>);
  }
  return getBaseSchema(elementPrimitive);
}

/**
 * Build the set schema for a union primitive.
 * Creates a Schema.Union of all variant schemas.
 */
function buildUnionSetSchema(unionPrimitive: UnionPrimitive<UnionVariants, any, any, any>): Schema.Schema<any> {
  const variants = unionPrimitive.variants;
  const variantSchemas: Schema.Schema<any>[] = [];
  
  for (const key in variants) {
    const variantPrimitive = variants[key]!;
    variantSchemas.push(buildStructSetSchema(variantPrimitive));
  }
  
  if (variantSchemas.length === 0) {
    return Schema.Unknown;
  }
  
  if (variantSchemas.length === 1) {
    return variantSchemas[0]!;
  }
  
  return Schema.Union(...variantSchemas as [Schema.Schema<any>, Schema.Schema<any>, ...Schema.Schema<any>[]]);
}

/**
 * Build the schema for an either primitive.
 * Creates a Schema.Union of all scalar variant types.
 */
function buildEitherSchema(eitherPrimitive: EitherPrimitive<readonly ScalarPrimitive[], any, any>): Schema.Schema<any> {
  const variants = eitherPrimitive.variants;
  const variantSchemas: Schema.Schema<any>[] = [];
  
  for (const variant of variants) {
    variantSchemas.push(getBaseSchema(variant as unknown as ConvertiblePrimitive));
  }
  
  if (variantSchemas.length === 0) {
    return Schema.Unknown;
  }
  
  if (variantSchemas.length === 1) {
    return variantSchemas[0]!;
  }
  
  return Schema.Union(...variantSchemas as [Schema.Schema<any>, Schema.Schema<any>, ...Schema.Schema<any>[]]);
}

/**
 * Build the update schema for a union primitive.
 * Creates a Schema.Union of all variant update schemas.
 */
function buildUnionUpdateSchema(unionPrimitive: UnionPrimitive<UnionVariants, any, any, any>): Schema.Schema<any> {
  const variants = unionPrimitive.variants;
  const variantSchemas: Schema.Schema<any>[] = [];
  
  for (const key in variants) {
    const variantPrimitive = variants[key]!;
    variantSchemas.push(buildStructUpdateSchema(variantPrimitive));
  }
  
  if (variantSchemas.length === 0) {
    return Schema.Unknown;
  }
  
  if (variantSchemas.length === 1) {
    return variantSchemas[0]!;
  }
  
  return Schema.Union(...variantSchemas as [Schema.Schema<any>, Schema.Schema<any>, ...Schema.Schema<any>[]]);
}

/**
 * Get the update schema for a primitive.
 * For structs, all fields are optional (partial updates).
 * For simple primitives, same as set schema.
 */
function getUpdateSchema(primitive: ConvertiblePrimitive): Schema.Schema<any> {
  switch (primitive._tag) {
    case "StructPrimitive": {
      const structPrimitive = primitive as unknown as StructPrimitive<Record<string, AnyPrimitive>, any, any>;
      return buildStructUpdateSchema(structPrimitive);
    }
    
    case "UnionPrimitive": {
      const unionPrimitive = primitive as unknown as UnionPrimitive<UnionVariants, any, any, any>;
      return buildUnionUpdateSchema(unionPrimitive);
    }
    
    case "TreeNodePrimitive": {
      const treeNodePrimitive = primitive as unknown as TreeNodePrimitive<string, StructPrimitive<any>, any>;
      // TreeNode update delegates to data struct's update schema (all fields optional)
      return buildStructUpdateSchema(treeNodePrimitive.data);
    }
    
    case "LazyPrimitive": {
      const lazyPrimitive = primitive as unknown as LazyPrimitive<() => AnyPrimitive>;
      const resolved = (lazyPrimitive as any)._resolve?.() ?? (lazyPrimitive as any)._thunk();
      return getUpdateSchema(resolved);
    }
    
    default:
      // For simple primitives, update schema is same as set schema
      return getBaseSchema(primitive);
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Convert a Mimic primitive to an Effect.Schema for set operations.
 * 
 * The resulting schema:
 * - For structs: required fields (required=true, no default) are non-optional, others are optional
 * - For arrays: uses the element's set schema
 * - For unions: creates a Schema.Union of variant schemas
 * - For TreeNode: delegates to the node's data struct schema
 * - For Tree: returns Schema.Array of TreeNodeState
 * 
 * @example
 * ```typescript
 * const UserSchema = Primitive.Struct({
 *   name: Primitive.String().required(),
 *   age: Primitive.Number().default(0),
 *   email: Primitive.String(),
 * });
 * 
 * const SetSchema = toSetSchema(UserSchema);
 * // { name: string, age?: number, email?: string }
 * ```
 */
export function toSetSchema<T extends AnyPrimitive>(primitive: T): ToSetSchema<T>;
export function toSetSchema<T extends AnyTreeNodePrimitive>(primitive: T): ToTreeNodeSetSchema<T>;
export function toSetSchema(primitive: ConvertiblePrimitive): Schema.Schema<any> {
  return getBaseSchema(primitive);
}

/**
 * Convert a Mimic primitive to an Effect.Schema for update operations.
 * 
 * The resulting schema:
 * - For structs: all fields are optional (partial updates)
 * - For unions: all variant fields are optional
 * - For TreeNode: delegates to the node's data struct update schema
 * - For simple primitives: same as set schema
 * 
 * @example
 * ```typescript
 * const UserSchema = Primitive.Struct({
 *   name: Primitive.String().required(),
 *   age: Primitive.Number().default(0),
 *   email: Primitive.String(),
 * });
 * 
 * const UpdateSchema = toUpdateSchema(UserSchema);
 * // { name?: string, age?: string, email?: string }
 * ```
 */
export function toUpdateSchema<T extends AnyPrimitive>(primitive: T): ToUpdateSchema<T>;
export function toUpdateSchema<T extends AnyTreeNodePrimitive>(primitive: T): ToTreeNodeUpdateSchema<T>;
export function toUpdateSchema(primitive: ConvertiblePrimitive): Schema.Schema<any> {
  return getUpdateSchema(primitive);
}
