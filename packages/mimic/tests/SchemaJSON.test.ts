import { describe, expect, it } from "@effect/vitest";
import * as Primitive from "../src/Primitive";
import * as SchemaJSON from "../src/SchemaJSON";
import * as OperationPath from "../src/OperationPath";

describe("SchemaJSON", () => {
  describe("String", () => {
    it("roundtrips a basic string", () => {
      const original = Primitive.String();
      const json = SchemaJSON.toJSON(original);
      const restored = SchemaJSON.fromJSON(json);

      expect(restored._tag).toBe("StringPrimitive");
      expect(restored._internal.getInitialState()).toBeUndefined();
    });

    it("roundtrips string with required and default", () => {
      const original = Primitive.String().default("hello").required();
      const json = SchemaJSON.toJSON(original);
      const restored = SchemaJSON.fromJSON(json);

      expect(restored._internal.getInitialState()).toBe("hello");
      expect((json as any).required).toBe(true);
      expect((json as any).default).toBe("hello");
    });

    it("roundtrips string with validators", () => {
      const original = Primitive.String().min(1).max(34);
      const json = SchemaJSON.toJSON(original);
      const restored = SchemaJSON.fromJSON(json);

      expect((json as any).validators).toEqual([
        { kind: "min", params: { value: 1 } },
        { kind: "max", params: { value: 34 } },
      ]);

      // Validators should work
      const op = (payload: string) => ({
        kind: "string.set" as const,
        path: OperationPath.make(""),
        payload,
      });

      expect(restored._internal.applyOperation(undefined, op("hello"))).toBe("hello");
      expect(() => restored._internal.applyOperation(undefined, op(""))).toThrow(Primitive.ValidationError);
    });

    it("roundtrips string with email validator", () => {
      const original = Primitive.String().email();
      const json = SchemaJSON.toJSON(original);
      const restored = SchemaJSON.fromJSON(json);

      expect((json as any).validators).toEqual([{ kind: "email" }]);

      const op = (payload: string) => ({
        kind: "string.set" as const,
        path: OperationPath.make(""),
        payload,
      });

      expect(restored._internal.applyOperation(undefined, op("test@example.com"))).toBe("test@example.com");
      expect(() => restored._internal.applyOperation(undefined, op("notanemail"))).toThrow(Primitive.ValidationError);
    });

    it("roundtrips string with url validator", () => {
      const original = Primitive.String().url();
      const json = SchemaJSON.toJSON(original);
      const restored = SchemaJSON.fromJSON(json);

      expect((json as any).validators).toEqual([{ kind: "url" }]);

      const op = (payload: string) => ({
        kind: "string.set" as const,
        path: OperationPath.make(""),
        payload,
      });

      expect(restored._internal.applyOperation(undefined, op("https://example.com"))).toBe("https://example.com");
      expect(() => restored._internal.applyOperation(undefined, op("not-a-url"))).toThrow(Primitive.ValidationError);
    });

    it("roundtrips string with regex validator", () => {
      const original = Primitive.String().regex(/^[A-Z]+$/i);
      const json = SchemaJSON.toJSON(original);
      const restored = SchemaJSON.fromJSON(json);

      expect((json as any).validators).toEqual([
        { kind: "regex", params: { pattern: "^[A-Z]+$", flags: "i" } },
      ]);

      const op = (payload: string) => ({
        kind: "string.set" as const,
        path: OperationPath.make(""),
        payload,
      });

      expect(restored._internal.applyOperation(undefined, op("ABC"))).toBe("ABC");
      expect(() => restored._internal.applyOperation(undefined, op("123"))).toThrow(Primitive.ValidationError);
    });

    it("roundtrips string with length validator", () => {
      const original = Primitive.String().length(5);
      const json = SchemaJSON.toJSON(original);
      const restored = SchemaJSON.fromJSON(json);

      const op = (payload: string) => ({
        kind: "string.set" as const,
        path: OperationPath.make(""),
        payload,
      });

      expect(restored._internal.applyOperation(undefined, op("hello"))).toBe("hello");
      expect(() => restored._internal.applyOperation(undefined, op("hi"))).toThrow(Primitive.ValidationError);
    });

    it("drops custom refine validators", () => {
      const original = Primitive.String().refine((v) => v.startsWith("x"), "must start with x").min(1);
      const json = SchemaJSON.toJSON(original);

      // Only built-in validator (min) should be serialized
      expect((json as any).validators).toEqual([{ kind: "min", params: { value: 1 } }]);
    });
  });

  describe("Number", () => {
    it("roundtrips a number with validators", () => {
      const original = Primitive.Number().min(0).max(100).int();
      const json = SchemaJSON.toJSON(original);
      const restored = SchemaJSON.fromJSON(json);

      expect(restored._tag).toBe("NumberPrimitive");
      expect((json as any).validators).toEqual([
        { kind: "min", params: { value: 0 } },
        { kind: "max", params: { value: 100 } },
        { kind: "int" },
      ]);

      const op = (payload: number) => ({
        kind: "number.set" as const,
        path: OperationPath.make(""),
        payload,
      });

      expect(restored._internal.applyOperation(undefined, op(50))).toBe(50);
      expect(() => restored._internal.applyOperation(undefined, op(-1))).toThrow(Primitive.ValidationError);
      expect(() => restored._internal.applyOperation(undefined, op(101))).toThrow(Primitive.ValidationError);
      expect(() => restored._internal.applyOperation(undefined, op(1.5))).toThrow(Primitive.ValidationError);
    });

    it("roundtrips number with positive/negative", () => {
      const pos = Primitive.Number().positive();
      const neg = Primitive.Number().negative();

      const posJSON = SchemaJSON.toJSON(pos);
      const negJSON = SchemaJSON.toJSON(neg);

      expect((posJSON as any).validators).toEqual([{ kind: "positive" }]);
      expect((negJSON as any).validators).toEqual([{ kind: "negative" }]);

      const restoredPos = SchemaJSON.fromJSON(posJSON);
      const restoredNeg = SchemaJSON.fromJSON(negJSON);

      const op = (payload: number) => ({
        kind: "number.set" as const,
        path: OperationPath.make(""),
        payload,
      });

      expect(restoredPos._internal.applyOperation(undefined, op(5))).toBe(5);
      expect(() => restoredPos._internal.applyOperation(undefined, op(-1))).toThrow(Primitive.ValidationError);

      expect(restoredNeg._internal.applyOperation(undefined, op(-5))).toBe(-5);
      expect(() => restoredNeg._internal.applyOperation(undefined, op(1))).toThrow(Primitive.ValidationError);
    });

    it("roundtrips number with default", () => {
      const original = Primitive.Number().default(42);
      const json = SchemaJSON.toJSON(original);
      const restored = SchemaJSON.fromJSON(json);

      expect(restored._internal.getInitialState()).toBe(42);
    });
  });

  describe("Boolean", () => {
    it("roundtrips a boolean", () => {
      const original = Primitive.Boolean().required();
      const json = SchemaJSON.toJSON(original);
      const restored = SchemaJSON.fromJSON(json);

      expect(restored._tag).toBe("BooleanPrimitive");
      expect((json as any).type).toBe("boolean");
      expect((json as any).required).toBe(true);
    });

    it("roundtrips boolean with default", () => {
      const original = Primitive.Boolean().default(true);
      const json = SchemaJSON.toJSON(original);
      const restored = SchemaJSON.fromJSON(json);

      expect(restored._internal.getInitialState()).toBe(true);
    });
  });

  describe("Literal", () => {
    it("roundtrips string literal", () => {
      const original = Primitive.Literal("card");
      const json = SchemaJSON.toJSON(original);
      const restored = SchemaJSON.fromJSON(json);

      expect(restored._tag).toBe("LiteralPrimitive");
      expect((json as any).type).toBe("literal");
      expect((json as any).value).toBe("card");
      expect((restored as Primitive.LiteralPrimitive<any>).literal).toBe("card");
    });

    it("roundtrips number literal", () => {
      const original = Primitive.Literal(42);
      const json = SchemaJSON.toJSON(original);
      const restored = SchemaJSON.fromJSON(json);

      expect((restored as Primitive.LiteralPrimitive<any>).literal).toBe(42);
    });

    it("roundtrips boolean literal", () => {
      const original = Primitive.Literal(true);
      const json = SchemaJSON.toJSON(original);
      const restored = SchemaJSON.fromJSON(json);

      expect((restored as Primitive.LiteralPrimitive<any>).literal).toBe(true);
    });

    it("roundtrips null literal", () => {
      const original = Primitive.Literal(null);
      const json = SchemaJSON.toJSON(original);
      const restored = SchemaJSON.fromJSON(json);

      expect((restored as Primitive.LiteralPrimitive<any>).literal).toBeNull();
    });
  });

  describe("Struct", () => {
    it("roundtrips a struct with nested fields", () => {
      const original = Primitive.Struct({
        name: Primitive.String().min(1).max(50),
        age: Primitive.Number().min(0),
        active: Primitive.Boolean().default(true),
      });

      const json = SchemaJSON.toJSON(original);
      const restored = SchemaJSON.fromJSON(json);

      expect(restored._tag).toBe("StructPrimitive");
      expect((json as any).type).toBe("struct");

      const fields = (restored as Primitive.StructPrimitive<any>).fields;
      expect(fields.name._tag).toBe("StringPrimitive");
      expect(fields.age._tag).toBe("NumberPrimitive");
      expect(fields.active._tag).toBe("BooleanPrimitive");
      expect(fields.active._internal.getInitialState()).toBe(true);
    });

    it("roundtrips struct with required fields", () => {
      const original = Primitive.Struct({
        title: Primitive.String().required(),
      }).required();

      const json = SchemaJSON.toJSON(original);

      expect((json as any).required).toBe(true);
      expect((json as any).fields.title.required).toBe(true);
    });
  });

  describe("Array", () => {
    it("roundtrips array with struct element", () => {
      const original = Primitive.Array(
        Primitive.Struct({
          name: Primitive.String(),
          value: Primitive.Number(),
        })
      );

      const json = SchemaJSON.toJSON(original);
      const restored = SchemaJSON.fromJSON(json);

      expect(restored._tag).toBe("ArrayPrimitive");
      expect((json as any).type).toBe("array");

      const element = (restored as Primitive.ArrayPrimitive<any>).element;
      expect(element._tag).toBe("StructPrimitive");
    });

    it("roundtrips array with validators", () => {
      const original = Primitive.Array(Primitive.String()).minLength(1).maxLength(10);
      const json = SchemaJSON.toJSON(original);

      expect((json as any).validators).toEqual([
        { kind: "minLength", params: { value: 1 } },
        { kind: "maxLength", params: { value: 10 } },
      ]);
    });
  });

  describe("Union", () => {
    it("roundtrips a discriminated union", () => {
      const original = Primitive.Union({
        discriminator: "type",
        variants: {
          text: Primitive.Struct({
            type: Primitive.Literal("text"),
            content: Primitive.String(),
          }),
          image: Primitive.Struct({
            type: Primitive.Literal("image"),
            url: Primitive.String().url(),
          }),
        },
      });

      const json = SchemaJSON.toJSON(original);
      const restored = SchemaJSON.fromJSON(json);

      expect(restored._tag).toBe("UnionPrimitive");
      expect((json as any).type).toBe("union");
      expect((json as any).discriminator).toBe("type");

      const variants = (restored as Primitive.UnionPrimitive<any, any>).variants;
      expect(variants.text._tag).toBe("StructPrimitive");
      expect(variants.image._tag).toBe("StructPrimitive");
    });
  });

  describe("Either", () => {
    it("roundtrips an either with mixed scalar types", () => {
      const original = Primitive.Either(
        Primitive.String(),
        Primitive.Number(),
      );

      const json = SchemaJSON.toJSON(original);
      const restored = SchemaJSON.fromJSON(json);

      expect(restored._tag).toBe("EitherPrimitive");
      expect((json as any).type).toBe("either");
      expect((json as any).variants).toHaveLength(2);

      const variants = (restored as Primitive.EitherPrimitive<any>).variants;
      expect(variants[0]._tag).toBe("StringPrimitive");
      expect(variants[1]._tag).toBe("NumberPrimitive");
    });
  });

  describe("Lazy", () => {
    it("resolves and serializes lazy primitives", () => {
      const original = Primitive.Lazy(() => Primitive.String().min(1));
      const json = SchemaJSON.toJSON(original);

      expect((json as any).type).toBe("string");
      expect((json as any).validators).toEqual([
        { kind: "min", params: { value: 1 } },
      ]);
    });
  });

  describe("Tree", () => {
    it("roundtrips a tree with multiple node types", () => {
      const CardNode = Primitive.TreeNode("card", {
        data: Primitive.Struct({
          title: Primitive.String().min(1).max(34),
          description: Primitive.String(),
        }),
        children: [Primitive.TreeNodeSelf],
      });

      const ColumnNode = Primitive.TreeNode("column", {
        data: Primitive.Struct({
          name: Primitive.String().min(1).max(34),
        }),
        children: [CardNode],
      });

      const BoardNode = Primitive.TreeNode("board", {
        data: Primitive.Struct({
          name: Primitive.String().default("My Board").min(1).max(34),
        }),
        children: [ColumnNode],
      });

      const original = Primitive.Tree({ root: BoardNode });
      const json = SchemaJSON.toJSON(original);
      const restored = SchemaJSON.fromJSON(json);

      expect(restored._tag).toBe("TreePrimitive");
      expect((json as any).type).toBe("tree");
      expect((json as any).root).toBe("board");

      const nodes = (json as any).nodes;
      expect(Object.keys(nodes)).toContain("board");
      expect(Object.keys(nodes)).toContain("column");
      expect(Object.keys(nodes)).toContain("card");

      // Verify node structure
      expect(nodes.board.children).toEqual(["column"]);
      expect(nodes.column.children).toEqual(["card"]);
      expect(nodes.card.children).toEqual(["card"]); // self-referential

      // Verify restored tree structure
      const restoredTree = restored as Primitive.TreePrimitive<any>;
      expect(restoredTree.root.type).toBe("board");
      expect(restoredTree.root.children.map((c: any) => c.type)).toEqual(["column"]);

      const restoredColumn = restoredTree.root.children[0]!;
      expect(restoredColumn.type).toBe("column");
      expect(restoredColumn.children.map((c: any) => c.type)).toEqual(["card"]);

      const restoredCard = restoredColumn.children[0]!;
      expect(restoredCard.type).toBe("card");
      // Self-referential: card's child is card
      expect(restoredCard.children.map((c: any) => c.type)).toEqual(["card"]);
    });

    it("preserves node data validators through roundtrip", () => {
      const ItemNode = Primitive.TreeNode("item", {
        data: Primitive.Struct({
          name: Primitive.String().min(1).max(100),
        }),
        children: [],
      });

      const RootNode = Primitive.TreeNode("root", {
        data: Primitive.Struct({
          title: Primitive.String(),
        }),
        children: [ItemNode],
      });

      const original = Primitive.Tree({ root: RootNode });
      const json = SchemaJSON.toJSON(original);

      const itemNode = (json as any).nodes.item;
      expect(itemNode.data.fields.name.validators).toEqual([
        { kind: "min", params: { value: 1 } },
        { kind: "max", params: { value: 100 } },
      ]);
    });
  });

  describe("Full roundtrip: kanban board", () => {
    it("serializes and deserializes the example kanban schema", () => {
      const CardNode = Primitive.TreeNode("card", {
        data: Primitive.Struct({
          title: Primitive.String().min(1).max(34),
          description: Primitive.String(),
        }),
        children: [Primitive.TreeNodeSelf],
      });

      const ColumnNode = Primitive.TreeNode("column", {
        data: Primitive.Struct({
          name: Primitive.String().min(1).max(34),
        }),
        children: [CardNode],
      });

      const BoardNode = Primitive.TreeNode("board", {
        data: Primitive.Struct({
          name: Primitive.String().default("My Board").min(1).max(34),
        }),
        children: [ColumnNode],
      });

      const original = Primitive.Tree({ root: BoardNode });

      // Serialize to JSON string and back
      const jsonObj = SchemaJSON.toJSON(original);
      const jsonString = JSON.stringify(jsonObj);
      const parsed = JSON.parse(jsonString);
      const restored = SchemaJSON.fromJSON(parsed);

      expect(restored._tag).toBe("TreePrimitive");

      // Verify the restored tree has correct structure
      const restoredTree = restored as Primitive.TreePrimitive<any>;
      expect(restoredTree.root.type).toBe("board");

      // Verify board data has default
      const boardDataFields = restoredTree.root.data.fields;
      expect(boardDataFields.name._internal.getInitialState()).toBe("My Board");
    });

    it("produces valid JSON", () => {
      const schema = Primitive.Struct({
        name: Primitive.String().min(1).max(50).required(),
        count: Primitive.Number().min(0).default(0),
        active: Primitive.Boolean().default(true),
        tag: Primitive.Literal("v1"),
      });

      const json = SchemaJSON.toJSON(schema);
      const jsonString = JSON.stringify(json);

      // Should be valid JSON
      expect(() => JSON.parse(jsonString)).not.toThrow();

      // Should roundtrip
      const restored = SchemaJSON.fromJSON(JSON.parse(jsonString));
      expect(restored._tag).toBe("StructPrimitive");
    });
  });
});
