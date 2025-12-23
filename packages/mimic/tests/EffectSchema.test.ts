import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";
import * as EffectSchema from "../src/EffectSchema";
import * as Primitive from "../src/Primitive";

// =============================================================================
// Simple Primitive Tests
// =============================================================================

describe("EffectSchema - Simple Primitives", () => {
  describe("toSetSchema", () => {
    it("converts StringPrimitive to Schema.String", () => {
      const primitive = Primitive.String();
      const schema = EffectSchema.toSetSchema(primitive);
      
      // Verify it accepts valid strings
      expect(Schema.decodeUnknownSync(schema)("hello")).toBe("hello");
    });

    it("converts NumberPrimitive to Schema.Number", () => {
      const primitive = Primitive.Number();
      const schema = EffectSchema.toSetSchema(primitive);
      
      expect(Schema.decodeUnknownSync(schema)(42)).toBe(42);
    });

    it("converts BooleanPrimitive to Schema.Boolean", () => {
      const primitive = Primitive.Boolean();
      const schema = EffectSchema.toSetSchema(primitive);
      
      expect(Schema.decodeUnknownSync(schema)(true)).toBe(true);
      expect(Schema.decodeUnknownSync(schema)(false)).toBe(false);
    });

    it("converts LiteralPrimitive to Schema.Literal", () => {
      const primitive = Primitive.Literal("active");
      const schema = EffectSchema.toSetSchema(primitive);
      
      expect(Schema.decodeUnknownSync(schema)("active")).toBe("active");
      
      // Should reject non-matching literals
      expect(() => Schema.decodeUnknownSync(schema)("inactive")).toThrow();
    });
  });

  describe("toUpdateSchema", () => {
    it("update schema for simple primitives is same as set schema", () => {
      const stringPrimitive = Primitive.String();
      const setSchema = EffectSchema.toSetSchema(stringPrimitive);
      const updateSchema = EffectSchema.toUpdateSchema(stringPrimitive);
      
      // Both should accept strings
      expect(Schema.decodeUnknownSync(setSchema)("test")).toBe("test");
      expect(Schema.decodeUnknownSync(updateSchema)("test")).toBe("test");
    });
  });
});

// =============================================================================
// Struct Primitive Tests
// =============================================================================

describe("EffectSchema - Struct Primitives", () => {
  describe("toSetSchema", () => {
    it("required fields are non-optional", () => {
      const primitive = Primitive.Struct({
        name: Primitive.String().required(),
      });
      
      const schema = EffectSchema.toSetSchema(primitive);
      
      // Should accept object with required field
      expect(Schema.decodeUnknownSync(schema)({ name: "Alice" })).toEqual({ name: "Alice" });
      
      // Should reject missing required field
      expect(() => Schema.decodeUnknownSync(schema)({})).toThrow();
    });

    it("fields with defaults are optional", () => {
      const primitive = Primitive.Struct({
        name: Primitive.String().default("default"),
      });
      
      const schema = EffectSchema.toSetSchema(primitive);
      
      // Should accept object with field
      expect(Schema.decodeUnknownSync(schema)({ name: "Alice" })).toEqual({ name: "Alice" });
      
      // Should accept object without field (field is optional)
      expect(Schema.decodeUnknownSync(schema)({})).toEqual({});
    });

    it("non-required fields are optional", () => {
      const primitive = Primitive.Struct({
        email: Primitive.String(),
      });
      
      const schema = EffectSchema.toSetSchema(primitive);
      
      // Should accept object with field
      expect(Schema.decodeUnknownSync(schema)({ email: "test@example.com" })).toEqual({ email: "test@example.com" });
      
      // Should accept object without field
      expect(Schema.decodeUnknownSync(schema)({})).toEqual({});
    });

    it("handles mixed required/optional fields", () => {
      const primitive = Primitive.Struct({
        name: Primitive.String().required(),
        age: Primitive.Number().default(0),
        email: Primitive.String(),
      });
      
      const schema = EffectSchema.toSetSchema(primitive);
      
      // Should accept with only required field
      expect(Schema.decodeUnknownSync(schema)({ name: "Alice" })).toEqual({ name: "Alice" });
      
      // Should accept with all fields
      expect(Schema.decodeUnknownSync(schema)({ 
        name: "Alice", 
        age: 30, 
        email: "alice@example.com" 
      })).toEqual({ 
        name: "Alice", 
        age: 30, 
        email: "alice@example.com" 
      });
      
      // Should reject missing required field
      expect(() => Schema.decodeUnknownSync(schema)({ age: 30 })).toThrow();
    });
  });

  describe("toUpdateSchema", () => {
    it("all fields are optional for updates", () => {
      const primitive = Primitive.Struct({
        name: Primitive.String().required(),
        age: Primitive.Number().default(0),
        email: Primitive.String(),
      });
      
      const schema = EffectSchema.toUpdateSchema(primitive);
      
      // Should accept empty object
      expect(Schema.decodeUnknownSync(schema)({})).toEqual({});
      
      // Should accept partial updates
      expect(Schema.decodeUnknownSync(schema)({ name: "Alice" })).toEqual({ name: "Alice" });
      expect(Schema.decodeUnknownSync(schema)({ age: 30 })).toEqual({ age: 30 });
      
      // Should accept full object
      expect(Schema.decodeUnknownSync(schema)({ 
        name: "Alice", 
        age: 30, 
        email: "alice@example.com" 
      })).toEqual({ 
        name: "Alice", 
        age: 30, 
        email: "alice@example.com" 
      });
    });
  });
});

// =============================================================================
// Nested Struct Tests
// =============================================================================

describe("EffectSchema - Nested Structs", () => {
  describe("toSetSchema", () => {
    it("handles nested struct with required fields", () => {
      const primitive = Primitive.Struct({
        user: Primitive.Struct({
          name: Primitive.String().required(),
          age: Primitive.Number(),
        }),
      });
      
      const schema = EffectSchema.toSetSchema(primitive);
      
      // Should accept valid nested structure
      expect(Schema.decodeUnknownSync(schema)({ 
        user: { name: "Alice" } 
      })).toEqual({ 
        user: { name: "Alice" } 
      });
      
      // Should reject missing required nested field
      expect(() => Schema.decodeUnknownSync(schema)({ user: {} })).toThrow();
    });
  });

  describe("toUpdateSchema", () => {
    it("nested struct fields are also optional for updates", () => {
      const primitive = Primitive.Struct({
        user: Primitive.Struct({
          name: Primitive.String().required(),
          age: Primitive.Number(),
        }),
      });
      
      const schema = EffectSchema.toUpdateSchema(primitive);
      
      // Should accept empty object
      expect(Schema.decodeUnknownSync(schema)({})).toEqual({});
      
      // Should accept partial nested update
      expect(Schema.decodeUnknownSync(schema)({ 
        user: { name: "Alice" } 
      })).toEqual({ 
        user: { name: "Alice" } 
      });
      
      // Should accept nested struct with empty object (all fields optional)
      expect(Schema.decodeUnknownSync(schema)({ user: {} })).toEqual({ user: {} });
    });
  });
});

// =============================================================================
// Array Primitive Tests
// =============================================================================

describe("EffectSchema - Array Primitives", () => {
  describe("toSetSchema", () => {
    it("converts simple array to Schema.Array", () => {
      const primitive = Primitive.Array(Primitive.String());
      const schema = EffectSchema.toSetSchema(primitive);
      
      expect(Schema.decodeUnknownSync(schema)(["a", "b", "c"])).toEqual(["a", "b", "c"]);
    });

    it("converts array of structs with proper field handling", () => {
      const primitive = Primitive.Array(
        Primitive.Struct({
          name: Primitive.String().required(),
          age: Primitive.Number(),
        })
      );
      
      const schema = EffectSchema.toSetSchema(primitive);
      
      // Should accept array with valid elements
      expect(Schema.decodeUnknownSync(schema)([
        { name: "Alice" },
        { name: "Bob", age: 30 },
      ])).toEqual([
        { name: "Alice" },
        { name: "Bob", age: 30 },
      ]);
      
      // Should reject element missing required field
      expect(() => Schema.decodeUnknownSync(schema)([{ age: 30 }])).toThrow();
    });
  });
});

// =============================================================================
// Union Primitive Tests
// =============================================================================

describe("EffectSchema - Union Primitives", () => {
  describe("toSetSchema", () => {
    it("creates union schema for variants", () => {
      const primitive = Primitive.Union({
        variants: {
          text: Primitive.Struct({
            type: Primitive.Literal("text"),
            content: Primitive.String().required(),
          }),
          image: Primitive.Struct({
            type: Primitive.Literal("image"),
            url: Primitive.String().required(),
          }),
        },
      });
      
      const schema = EffectSchema.toSetSchema(primitive);
      
      // Should accept text variant
      expect(Schema.decodeUnknownSync(schema)({ 
        type: "text", 
        content: "Hello" 
      })).toEqual({ 
        type: "text", 
        content: "Hello" 
      });
      
      // Should accept image variant
      expect(Schema.decodeUnknownSync(schema)({ 
        type: "image", 
        url: "https://example.com/image.png" 
      })).toEqual({ 
        type: "image", 
        url: "https://example.com/image.png" 
      });
    });
  });

  describe("toUpdateSchema", () => {
    it("all variant fields are optional for updates", () => {
      const primitive = Primitive.Union({
        variants: {
          text: Primitive.Struct({
            type: Primitive.Literal("text"),
            content: Primitive.String().required(),
          }),
        },
      });
      
      const schema = EffectSchema.toUpdateSchema(primitive);
      
      // Should accept partial variant
      expect(Schema.decodeUnknownSync(schema)({ type: "text" })).toEqual({ type: "text" });
    });
  });
});

// =============================================================================
// Either Primitive Tests
// =============================================================================

describe("EffectSchema - Either Primitives", () => {
  describe("toSetSchema", () => {
    it("creates union of scalar types", () => {
      const primitive = Primitive.Either(
        Primitive.String(),
        Primitive.Number()
      );
      
      const schema = EffectSchema.toSetSchema(primitive);
      
      // Should accept string
      expect(Schema.decodeUnknownSync(schema)("hello")).toBe("hello");
      
      // Should accept number
      expect(Schema.decodeUnknownSync(schema)(42)).toBe(42);
      
      // Should reject non-matching types
      expect(() => Schema.decodeUnknownSync(schema)(true)).toThrow();
    });
  });
});

// =============================================================================
// TreeNode Primitive Tests
// =============================================================================

describe("EffectSchema - TreeNode Primitives", () => {
  describe("toSetSchema", () => {
    it("delegates to data struct for set schema", () => {
      const CardNode = Primitive.TreeNode("card", {
        data: Primitive.Struct({
          title: Primitive.String().required(),
          description: Primitive.String(),
        }),
        children: [Primitive.TreeNodeSelf],
      });
      
      const schema = EffectSchema.toSetSchema(CardNode);
      
      // Should accept valid data with required field
      expect(Schema.decodeUnknownSync(schema)({ 
        title: "My Card" 
      })).toEqual({ 
        title: "My Card" 
      });
      
      // Should accept valid data with all fields
      expect(Schema.decodeUnknownSync(schema)({ 
        title: "My Card", 
        description: "Card description" 
      })).toEqual({ 
        title: "My Card", 
        description: "Card description" 
      });
      
      // Should reject missing required field
      expect(() => Schema.decodeUnknownSync(schema)({})).toThrow();
      expect(() => Schema.decodeUnknownSync(schema)({ description: "no title" })).toThrow();
    });
  });

  describe("toUpdateSchema", () => {
    it("all data fields are optional for updates", () => {
      const CardNode = Primitive.TreeNode("card", {
        data: Primitive.Struct({
          title: Primitive.String().required(),
          description: Primitive.String(),
        }),
        children: [Primitive.TreeNodeSelf],
      });
      
      const schema = EffectSchema.toUpdateSchema(CardNode);
      
      // Should accept empty update
      expect(Schema.decodeUnknownSync(schema)({})).toEqual({});
      
      // Should accept partial update
      expect(Schema.decodeUnknownSync(schema)({ 
        title: "Updated Title" 
      })).toEqual({ 
        title: "Updated Title" 
      });
      
      // Should accept update with only optional field
      expect(Schema.decodeUnknownSync(schema)({ 
        description: "New description" 
      })).toEqual({ 
        description: "New description" 
      });
    });
  });
});

// =============================================================================
// Tree Primitive Tests
// =============================================================================

describe("EffectSchema - Tree Primitives", () => {
  describe("toSetSchema", () => {
    it("returns array of TreeNodeState schema", () => {
      const FolderNode = Primitive.TreeNode("folder", {
        data: Primitive.Struct({
          name: Primitive.String().required(),
        }),
        children: [Primitive.TreeNodeSelf],
      });
      
      const treePrimitive = Primitive.Tree({
        root: FolderNode,
      });
      
      const schema = EffectSchema.toSetSchema(treePrimitive);
      
      // Should accept valid tree state
      expect(Schema.decodeUnknownSync(schema)([
        {
          id: "node-1",
          type: "folder",
          parentId: null,
          pos: "a0",
          data: { name: "Root" },
        },
      ])).toEqual([
        {
          id: "node-1",
          type: "folder",
          parentId: null,
          pos: "a0",
          data: { name: "Root" },
        },
      ]);
    });
  });
});

// =============================================================================
// TreeNodeStateSchema Export Tests
// =============================================================================

describe("EffectSchema - TreeNodeStateSchema", () => {
  it("validates tree node state structure", () => {
    const validNodeState = {
      id: "node-123",
      type: "card",
      parentId: "parent-456",
      pos: "a0",
      data: { title: "Test" },
    };
    
    expect(Schema.decodeUnknownSync(EffectSchema.TreeNodeStateSchema)(validNodeState)).toEqual(validNodeState);
  });

  it("accepts null parentId for root nodes", () => {
    const rootNodeState = {
      id: "root-1",
      type: "folder",
      parentId: null,
      pos: "a0",
      data: { name: "Root" },
    };
    
    expect(Schema.decodeUnknownSync(EffectSchema.TreeNodeStateSchema)(rootNodeState)).toEqual(rootNodeState);
  });

  it("rejects invalid node state", () => {
    const invalidNodeState = {
      id: 123, // should be string
      type: "card",
      parentId: null,
      pos: "a0",
      data: {},
    };
    
    expect(() => Schema.decodeUnknownSync(EffectSchema.TreeNodeStateSchema)(invalidNodeState)).toThrow();
  });
});

// =============================================================================
// Complex Example Tests
// =============================================================================

describe("EffectSchema - Complex Examples", () => {
  it("handles the example schema from the plan", () => {
    const UserSchema = Primitive.Struct({
      name: Primitive.String().required(),
      age: Primitive.Number().default(0),
      email: Primitive.String(),
    });
    
    const setSchema = EffectSchema.toSetSchema(UserSchema);
    const updateSchema = EffectSchema.toUpdateSchema(UserSchema);
    
    // Set schema: name required, others optional
    expect(Schema.decodeUnknownSync(setSchema)({ name: "Alice" })).toEqual({ name: "Alice" });
    expect(() => Schema.decodeUnknownSync(setSchema)({})).toThrow();
    
    // Update schema: all optional
    expect(Schema.decodeUnknownSync(updateSchema)({})).toEqual({});
    expect(Schema.decodeUnknownSync(updateSchema)({ age: 30 })).toEqual({ age: 30 });
  });

  it("handles the TreeNode example from the plan", () => {
    const CardNode = Primitive.TreeNode("card", {
      data: Primitive.Struct({
        title: Primitive.String().required(),
        description: Primitive.String(),
      }),
      children: [Primitive.TreeNodeSelf],
    });
    
    const setSchema = EffectSchema.toSetSchema(CardNode);
    const updateSchema = EffectSchema.toUpdateSchema(CardNode);
    
    // Set schema: title required, description optional
    expect(Schema.decodeUnknownSync(setSchema)({ title: "Test" })).toEqual({ title: "Test" });
    expect(() => Schema.decodeUnknownSync(setSchema)({})).toThrow();
    
    // Update schema: all optional
    expect(Schema.decodeUnknownSync(updateSchema)({})).toEqual({});
    expect(Schema.decodeUnknownSync(updateSchema)({ description: "Updated" })).toEqual({ description: "Updated" });
  });
});

