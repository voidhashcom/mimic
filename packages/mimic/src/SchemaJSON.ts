import type { AnyPrimitive, Validator } from "./primitives/shared";
import { StringPrimitive } from "./primitives/String";
import { NumberPrimitive } from "./primitives/Number";
import { BooleanPrimitive } from "./primitives/Boolean";
import { LiteralPrimitive } from "./primitives/Literal";
import { StructPrimitive } from "./primitives/Struct";
import { ArrayPrimitive } from "./primitives/Array";
import { LazyPrimitive } from "./primitives/Lazy";
import { UnionPrimitive } from "./primitives/Union";
import { EitherPrimitive } from "./primitives/Either";
import { TreePrimitive } from "./primitives/Tree";
import { TreeNodePrimitive, type AnyTreeNodePrimitive } from "./primitives/TreeNode";
import * as Primitive from "./Primitive";

// =============================================================================
// JSON Types
// =============================================================================

interface ValidatorJSON {
  readonly kind: string;
  readonly params?: unknown;
}

interface ScalarJSON {
  readonly type: "string" | "number" | "boolean";
  readonly required: boolean;
  readonly default?: unknown;
  readonly validators?: readonly ValidatorJSON[];
}

interface LiteralJSON {
  readonly type: "literal";
  readonly value: string | number | boolean | null;
  readonly required: boolean;
  readonly default?: unknown;
}

interface StructJSON {
  readonly type: "struct";
  readonly required: boolean;
  readonly default?: unknown;
  readonly fields: Record<string, unknown>;
}

interface ArrayJSON {
  readonly type: "array";
  readonly required: boolean;
  readonly default?: unknown;
  readonly element: unknown;
  readonly validators?: readonly ValidatorJSON[];
}

interface UnionJSON {
  readonly type: "union";
  readonly required: boolean;
  readonly default?: unknown;
  readonly discriminator: string;
  readonly variants: Record<string, unknown>;
}

interface EitherJSON {
  readonly type: "either";
  readonly required: boolean;
  readonly default?: unknown;
  readonly variants: readonly unknown[];
}

interface TreeNodeJSON {
  readonly type: "treeNode";
  readonly nodeType: string;
  readonly data: unknown;
  readonly children: readonly string[];
}

interface TreeJSON {
  readonly type: "tree";
  readonly required: boolean;
  readonly default?: unknown;
  readonly root: string;
  readonly nodes: Record<string, TreeNodeJSON>;
}

// =============================================================================
// Helper: access private _schema
// =============================================================================

function getSchema(primitive: AnyPrimitive): any {
  return (primitive as any)._schema;
}

// =============================================================================
// Serialize validators
// =============================================================================

function serializeValidators(validators: readonly Validator<any>[]): ValidatorJSON[] | undefined {
  const serializable = validators.filter((v) => v.kind != null);
  if (serializable.length === 0) return undefined;
  return serializable.map((v) => {
    const json: ValidatorJSON = { kind: v.kind! };
    if (v.params !== undefined) {
      return { ...json, params: v.params };
    }
    return json;
  });
}

// =============================================================================
// toJSON
// =============================================================================

function collectTreeNodes(
  node: AnyTreeNodePrimitive,
  visited: Map<string, AnyTreeNodePrimitive>
): void {
  if (visited.has(node.type)) return;
  visited.set(node.type, node);
  for (const child of node.children) {
    collectTreeNodes(child, visited);
  }
}

export function toJSON(primitive: AnyPrimitive): unknown {
  // Resolve Lazy first
  if (primitive instanceof LazyPrimitive) {
    const resolved = (primitive as any)._resolve();
    return toJSON(resolved);
  }

  const schema = getSchema(primitive);

  if (primitive instanceof StringPrimitive) {
    const json: any = { type: "string", required: schema.required };
    if (schema.defaultValue !== undefined) json.default = schema.defaultValue;
    const validators = serializeValidators(schema.validators);
    if (validators) json.validators = validators;
    return json;
  }

  if (primitive instanceof NumberPrimitive) {
    const json: any = { type: "number", required: schema.required };
    if (schema.defaultValue !== undefined) json.default = schema.defaultValue;
    const validators = serializeValidators(schema.validators);
    if (validators) json.validators = validators;
    return json;
  }

  if (primitive instanceof BooleanPrimitive) {
    const json: any = { type: "boolean", required: schema.required };
    if (schema.defaultValue !== undefined) json.default = schema.defaultValue;
    return json;
  }

  if (primitive instanceof LiteralPrimitive) {
    const json: any = {
      type: "literal",
      value: (primitive as LiteralPrimitive<any>).literal,
      required: schema.required,
    };
    if (schema.defaultValue !== undefined) json.default = schema.defaultValue;
    return json;
  }

  if (primitive instanceof StructPrimitive) {
    const fields: Record<string, unknown> = {};
    const structFields = (primitive as StructPrimitive<any>).fields;
    for (const key in structFields) {
      fields[key] = toJSON(structFields[key]!);
    }
    const json: any = { type: "struct", required: schema.required, fields };
    if (schema.defaultValue !== undefined) json.default = schema.defaultValue;
    return json;
  }

  if (primitive instanceof ArrayPrimitive) {
    const json: any = {
      type: "array",
      required: schema.required,
      element: toJSON((primitive as ArrayPrimitive<any>).element),
    };
    if (schema.defaultValue !== undefined) json.default = schema.defaultValue;
    const validators = serializeValidators(schema.validators);
    if (validators) json.validators = validators;
    return json;
  }

  if (primitive instanceof UnionPrimitive) {
    const variants: Record<string, unknown> = {};
    const unionVariants = (primitive as UnionPrimitive<any, any>).variants;
    for (const key in unionVariants) {
      variants[key] = toJSON(unionVariants[key]!);
    }
    const json: any = {
      type: "union",
      required: schema.required,
      discriminator: (primitive as UnionPrimitive<any, any>).discriminator,
      variants,
    };
    if (schema.defaultValue !== undefined) json.default = schema.defaultValue;
    return json;
  }

  if (primitive instanceof EitherPrimitive) {
    const variants = (primitive as EitherPrimitive<any>).variants;
    const json: any = {
      type: "either",
      required: schema.required,
      variants: variants.map((v: AnyPrimitive) => toJSON(v)),
    };
    if (schema.defaultValue !== undefined) json.default = schema.defaultValue;
    return json;
  }

  if (primitive instanceof TreePrimitive) {
    const root = (primitive as TreePrimitive<any>).root;
    const nodeMap = new Map<string, AnyTreeNodePrimitive>();
    collectTreeNodes(root, nodeMap);

    const nodes: Record<string, TreeNodeJSON> = {};
    for (const [nodeType, node] of nodeMap) {
      nodes[nodeType] = {
        type: "treeNode",
        nodeType,
        data: toJSON(node.data),
        children: node.children.map((c) => c.type),
      };
    }

    const json: any = {
      type: "tree",
      required: schema.required,
      root: root.type,
      nodes,
    };
    if (schema.defaultInput !== undefined) json.default = schema.defaultInput;
    return json;
  }

  throw new Error(`Unknown primitive type: ${primitive._tag}`);
}

// =============================================================================
// fromJSON
// =============================================================================

function applyStringValidators(p: StringPrimitive<any, any>, validators: readonly ValidatorJSON[]): StringPrimitive<any, any> {
  let result = p;
  for (const v of validators) {
    const params = v.params as any;
    switch (v.kind) {
      case "min": result = result.min(params.value); break;
      case "max": result = result.max(params.value); break;
      case "length": result = result.length(params.value); break;
      case "regex": result = result.regex(new RegExp(params.pattern, params.flags)); break;
      case "email": result = result.email(); break;
      case "url": result = result.url(); break;
    }
  }
  return result;
}

function applyNumberValidators(p: NumberPrimitive<any, any>, validators: readonly ValidatorJSON[]): NumberPrimitive<any, any> {
  let result = p;
  for (const v of validators) {
    const params = v.params as any;
    switch (v.kind) {
      case "min": result = result.min(params.value); break;
      case "max": result = result.max(params.value); break;
      case "positive": result = result.positive(); break;
      case "negative": result = result.negative(); break;
      case "int": result = result.int(); break;
    }
  }
  return result;
}

function applyArrayValidators(p: ArrayPrimitive<any, any, any>, validators: readonly ValidatorJSON[]): ArrayPrimitive<any, any, any> {
  let result = p;
  for (const v of validators) {
    const params = v.params as any;
    switch (v.kind) {
      case "minLength": result = result.minLength(params.value); break;
      case "maxLength": result = result.maxLength(params.value); break;
    }
  }
  return result;
}

export function fromJSON(json: unknown): AnyPrimitive {
  const obj = json as any;

  switch (obj.type) {
    case "string": {
      let p: StringPrimitive<any, any> = Primitive.String();
      if (obj.validators) p = applyStringValidators(p, obj.validators);
      if (obj.required) p = p.required();
      if (obj.default !== undefined) p = p.default(obj.default);
      return p;
    }

    case "number": {
      let p: NumberPrimitive<any, any> = Primitive.Number();
      if (obj.validators) p = applyNumberValidators(p, obj.validators);
      if (obj.required) p = p.required();
      if (obj.default !== undefined) p = p.default(obj.default);
      return p;
    }

    case "boolean": {
      let p: BooleanPrimitive<any, any> = Primitive.Boolean();
      if (obj.required) p = p.required();
      if (obj.default !== undefined) p = p.default(obj.default);
      return p;
    }

    case "literal": {
      let p: LiteralPrimitive<any, any, any> = Primitive.Literal(obj.value);
      if (obj.required) p = p.required();
      if (obj.default !== undefined) p = p.default(obj.default);
      return p;
    }

    case "struct": {
      const fields: Record<string, AnyPrimitive> = {};
      for (const key in obj.fields) {
        fields[key] = fromJSON(obj.fields[key]);
      }
      let p: StructPrimitive<any, any, any> = Primitive.Struct(fields);
      if (obj.required) p = p.required();
      if (obj.default !== undefined) p = p.default(obj.default);
      return p;
    }

    case "array": {
      const element = fromJSON(obj.element);
      let p: ArrayPrimitive<any, any, any> = Primitive.Array(element);
      if (obj.validators) p = applyArrayValidators(p, obj.validators);
      if (obj.required) p = p.required();
      if (obj.default !== undefined) p = p.default(obj.default);
      return p;
    }

    case "union": {
      const variants: Record<string, any> = {};
      for (const key in obj.variants) {
        variants[key] = fromJSON(obj.variants[key]);
      }
      let p: UnionPrimitive<any, any, any, any> = Primitive.Union({
        discriminator: obj.discriminator,
        variants,
      });
      if (obj.required) p = p.required();
      if (obj.default !== undefined) p = p.default(obj.default);
      return p;
    }

    case "either": {
      const variants = obj.variants.map((v: unknown) => fromJSON(v));
      let p: EitherPrimitive<any, any, any> = Primitive.Either(...variants);
      if (obj.required) p = p.required();
      if (obj.default !== undefined) p = p.default(obj.default);
      return p;
    }

    case "tree": {
      const treeJSON = obj as TreeJSON;
      // First pass: create all TreeNode primitives with placeholder children
      const nodeMap = new Map<string, AnyTreeNodePrimitive>();
      const nodeJSONMap = new Map<string, TreeNodeJSON>();

      for (const nodeType in treeJSON.nodes) {
        nodeJSONMap.set(nodeType, treeJSON.nodes[nodeType]!);
      }

      // Create nodes with lazy children to handle circular references
      for (const [nodeType, nodeJSON] of nodeJSONMap) {
        const data = fromJSON(nodeJSON.data) as StructPrimitive<any>;
        const childTypes = nodeJSON.children;

        const node = Primitive.TreeNode(nodeType, {
          data,
          children: () => childTypes.map((ct) => nodeMap.get(ct)!),
        });
        nodeMap.set(nodeType, node);
      }

      const root = nodeMap.get(treeJSON.root)!;
      let p: TreePrimitive<any, any, any> = Primitive.Tree({ root });
      if (obj.required) p = p.required();
      if (obj.default !== undefined) p = p.default(obj.default);
      return p;
    }

    default:
      throw new Error(`Unknown JSON schema type: ${obj.type}`);
  }
}
