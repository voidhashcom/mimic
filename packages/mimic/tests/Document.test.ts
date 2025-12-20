import { describe, expect, it } from "@effect/vitest";
import * as Document from "../src/Document";
import * as Primitive from "../src/Primitive";
import * as Transaction from "../src/Transaction";
import * as OperationPath from "../src/OperationPath";

describe("Document", () => {
  describe("make", () => {
    it("creates a document with a schema", () => {
      const schema = Primitive.Struct({
        name: Primitive.String(),
        age: Primitive.Number(),
      });

      const doc = Document.make(schema);

      expect(doc.schema).toBe(schema);
      expect(doc.root).toBeDefined();
    });

    it("initializes with default values from schema", () => {
      const schema = Primitive.Struct({
        name: Primitive.String().default("John"),
        age: Primitive.Number().default(25),
      });

      const doc = Document.make(schema);

      expect(doc.get()).toEqual({ name: "John", age: 25 });
    });

    it("initializes with provided initial state", () => {
      const schema = Primitive.Struct({
        name: Primitive.String(),
        age: Primitive.Number(),
      });

      const doc = Document.make(schema, {
        initial: { name: "Jane", age: 30 },
      });

      expect(doc.get()).toEqual({ name: "Jane", age: 30 });
    });

    it("returns undefined state when no defaults or initial value", () => {
      const schema = Primitive.Struct({
        name: Primitive.String(),
        age: Primitive.Number(),
      });

      const doc = Document.make(schema);

      expect(doc.get()).toBeUndefined();
    });
  });

  describe("root proxy", () => {
    it("get() returns current field value", () => {
      const schema = Primitive.Struct({
        name: Primitive.String(),
      });

      const doc = Document.make(schema, {
        initial: { name: "Alice" },
      });

      expect(doc.root.name.get()).toBe("Alice");
    });

    it("set() updates state and generates operation", () => {
      const schema = Primitive.Struct({
        name: Primitive.String(),
      });

      const doc = Document.make(schema, {
        initial: { name: "Alice" },
      });

      doc.root.name.set("Bob");

      expect(doc.root.name.get()).toBe("Bob");
      expect(doc.get()).toEqual({ name: "Bob" });
    });

    it("nested field access works correctly", () => {
      const schema = Primitive.Struct({
        user: Primitive.Struct({
          profile: Primitive.Struct({
            email: Primitive.String(),
          }),
        }),
      });

      const doc = Document.make(schema, {
        initial: {
          user: {
            profile: {
              email: "old@example.com",
            },
          },
        },
      });

      expect(doc.root.user.profile.email.get()).toBe("old@example.com");

      doc.root.user.profile.email.set("new@example.com");

      expect(doc.root.user.profile.email.get()).toBe("new@example.com");
    });
  });

  describe("transaction", () => {
    it("commits multiple operations atomically", () => {
      const schema = Primitive.Struct({
        name: Primitive.String(),
        age: Primitive.Number(),
      });

      const doc = Document.make(schema, {
        initial: { name: "Alice", age: 20 },
      });

      doc.transaction((root) => {
        root.name.set("Bob");
        root.age.set(30);
      });

      expect(doc.get()).toEqual({ name: "Bob", age: 30 });
    });

    it("returns the result of the transaction function", () => {
      const schema = Primitive.Struct({
        name: Primitive.String(),
      });

      const doc = Document.make(schema, {
        initial: { name: "Alice" },
      });

      const result = doc.transaction((root) => {
        root.name.set("Bob");
        return "success";
      });

      expect(result).toBe("success");
    });

    it("rolls back on error", () => {
      const schema = Primitive.Struct({
        name: Primitive.String(),
        age: Primitive.Number(),
      });

      const doc = Document.make(schema, {
        initial: { name: "Alice", age: 20 },
      });

      expect(() => {
        doc.transaction((root) => {
          root.name.set("Bob");
          throw new Error("Intentional error");
        });
      }).toThrow("Intentional error");

      // State should be rolled back
      expect(doc.get()).toEqual({ name: "Alice", age: 20 });
    });

    it("reads updated values within transaction", () => {
      const schema = Primitive.Struct({
        count: Primitive.Number(),
      });

      const doc = Document.make(schema, {
        initial: { count: 0 },
      });

      doc.transaction((root) => {
        root.count.set(1);
        expect(root.count.get()).toBe(1);

        root.count.set(2);
        expect(root.count.get()).toBe(2);
      });

      expect(doc.root.count.get()).toBe(2);
    });

    it("throws NestedTransactionError for nested transactions", () => {
      const schema = Primitive.Struct({
        name: Primitive.String(),
      });

      const doc = Document.make(schema);

      expect(() => {
        doc.transaction((root) => {
          doc.transaction((innerRoot) => {
            innerRoot.name.set("nested");
          });
        });
      }).toThrow(Document.NestedTransactionError);
    });

    it("operations outside transaction are auto-wrapped", () => {
      const schema = Primitive.Struct({
        name: Primitive.String(),
      });

      const doc = Document.make(schema, {
        initial: { name: "Alice" },
      });

      // Direct set outside transaction
      doc.root.name.set("Bob");

      expect(doc.get()).toEqual({ name: "Bob" });

      // Should have pending operations
      const tx = doc.flush();
      expect(tx.ops).toHaveLength(1);
      expect(tx.ops[0]!.kind).toBe("string.set");
    });
  });

  describe("flush", () => {
    it("returns pending operations as a transaction", () => {
      const schema = Primitive.Struct({
        name: Primitive.String(),
        age: Primitive.Number(),
      });

      const doc = Document.make(schema, {
        initial: { name: "Alice", age: 20 },
      });

      doc.transaction((root) => {
        root.name.set("Bob");
        root.age.set(30);
      });

      const tx = doc.flush();

      expect(tx.ops).toHaveLength(2);
      expect(tx.id).toBeDefined();
      expect(tx.timestamp).toBeDefined();
    });

    it("clears pending operations after flush", () => {
      const schema = Primitive.Struct({
        name: Primitive.String(),
      });

      const doc = Document.make(schema, {
        initial: { name: "Alice" },
      });

      doc.root.name.set("Bob");

      const tx1 = doc.flush();
      expect(tx1.ops).toHaveLength(1);

      const tx2 = doc.flush();
      expect(tx2.ops).toHaveLength(0);
    });

    it("returns empty transaction when no pending operations", () => {
      const schema = Primitive.Struct({
        name: Primitive.String(),
      });

      const doc = Document.make(schema);

      const tx = doc.flush();

      expect(tx.ops).toHaveLength(0);
      expect(Transaction.isEmpty(tx)).toBe(true);
    });
  });

  describe("apply", () => {
    it("applies external operations to state", () => {
      const schema = Primitive.Struct({
        name: Primitive.String(),
      });

      const doc = Document.make(schema, {
        initial: { name: "Alice" },
      });

      doc.apply([
        {
          kind: "string.set",
          path: OperationPath.make("name"),
          payload: "Bob",
        },
      ]);

      expect(doc.get()).toEqual({ name: "Bob" });
    });

    it("applied operations are not added to pending", () => {
      const schema = Primitive.Struct({
        name: Primitive.String(),
      });

      const doc = Document.make(schema, {
        initial: { name: "Alice" },
      });

      doc.apply([
        {
          kind: "string.set",
          path: OperationPath.make("name"),
          payload: "Bob",
        },
      ]);

      const tx = doc.flush();
      expect(tx.ops).toHaveLength(0);
    });

    it("applies multiple operations in sequence", () => {
      const schema = Primitive.Struct({
        name: Primitive.String(),
        age: Primitive.Number(),
      });

      const doc = Document.make(schema, {
        initial: { name: "Alice", age: 20 },
      });

      doc.apply([
        {
          kind: "string.set",
          path: OperationPath.make("name"),
          payload: "Bob",
        },
        {
          kind: "number.set",
          path: OperationPath.make("age"),
          payload: 30,
        },
      ]);

      expect(doc.get()).toEqual({ name: "Bob", age: 30 });
    });

    it("throws OperationError for invalid operations", () => {
      const schema = Primitive.Struct({
        name: Primitive.String(),
      });

      const doc = Document.make(schema, {
        initial: { name: "Alice" },
      });

      expect(() => {
        doc.apply([
          {
            kind: "string.set",
            path: OperationPath.make("name"),
            payload: 123, // Invalid: number instead of string
          },
        ]);
      }).toThrow(Document.OperationError);
    });
  });

  describe("arrays", () => {
    it("works with array primitives", () => {
      const schema = Primitive.Struct({
        items: Primitive.Array(Primitive.String()),
      });

      const doc = Document.make(schema, {
        initial: { items: [] },
      });

      doc.root.items.push("first");

      const items = doc.root.items.get();
      expect(items).toHaveLength(1);
      expect(items[0]!.value).toBe("first");
    });

    it("array operations generate correct pending ops", () => {
      const schema = Primitive.Struct({
        items: Primitive.Array(Primitive.String()),
      });

      const doc = Document.make(schema, {
        initial: { items: [] },
      });

      doc.transaction((root) => {
        root.items.push("first");
        root.items.push("second");
      });

      const tx = doc.flush();
      expect(tx.ops).toHaveLength(2);
      expect(tx.ops[0]!.kind).toBe("array.insert");
      expect(tx.ops[1]!.kind).toBe("array.insert");
    });

    it("modifying array elements works", () => {
      const schema = Primitive.Struct({
        users: Primitive.Array(
          Primitive.Struct({
            name: Primitive.String(),
          })
        ),
      });

      const entryId = "test-entry-id";
      const doc = Document.make(schema, {
        initial: {
          users: [{ id: entryId, pos: "a0", value: { name: "Alice" } }],
        },
      });

      doc.root.users.at(entryId).name.set("Bob");

      const users = doc.root.users.get();
      expect(users[0]!.value.name).toBe("Bob");
    });
  });

  describe("complex scenarios", () => {
    it("handles interleaved local and remote operations", () => {
      const schema = Primitive.Struct({
        counter: Primitive.Number(),
      });

      const doc = Document.make(schema, {
        initial: { counter: 0 },
      });

      // Local operation
      doc.root.counter.set(1);

      // Remote operation
      doc.apply([
        {
          kind: "number.set",
          path: OperationPath.make("counter"),
          payload: 10,
        },
      ]);

      // Another local operation
      doc.root.counter.set(11);

      expect(doc.get()).toEqual({ counter: 11 });

      // Only local ops should be pending
      const tx = doc.flush();
      expect(tx.ops).toHaveLength(2);
    });

    it("handles struct with all primitive types", () => {
      const schema = Primitive.Struct({
        str: Primitive.String(),
        num: Primitive.Number(),
        bool: Primitive.Boolean(),
        literal: Primitive.Literal("status" as const),
      });

      const doc = Document.make(schema, {
        initial: {
          str: "hello",
          num: 42,
          bool: true,
          literal: "status",
        },
      });

      doc.transaction((root) => {
        root.str.set("world");
        root.num.set(100);
        root.bool.set(false);
      });

      expect(doc.get()).toEqual({
        str: "world",
        num: 100,
        bool: false,
        literal: "status",
      });
    });
  });

  describe("toSnapshot", () => {
    it("returns snapshot of document state", () => {
      const schema = Primitive.Struct({
        name: Primitive.String(),
        age: Primitive.Number(),
      });

      const doc = Document.make(schema, {
        initial: { name: "Alice", age: 30 },
      });

      const snapshot = doc.toSnapshot();

      expect(snapshot).toEqual({ name: "Alice", age: 30 });
    });

    it("respects field defaults in snapshot", () => {
      const schema = Primitive.Struct({
        name: Primitive.String().default("Unknown"),
        count: Primitive.Number().default(0),
      });

      const doc = Document.make(schema);

      const snapshot = doc.toSnapshot();

      expect(snapshot).toEqual({ name: "Unknown", count: 0 });
    });

    it("reflects state changes in snapshot", () => {
      const schema = Primitive.Struct({
        name: Primitive.String(),
      });

      const doc = Document.make(schema, {
        initial: { name: "Alice" },
      });

      expect(doc.toSnapshot()).toEqual({ name: "Alice" });

      doc.root.name.set("Bob");

      expect(doc.toSnapshot()).toEqual({ name: "Bob" });
    });

    it("handles arrays in snapshot", () => {
      const schema = Primitive.Struct({
        items: Primitive.Array(Primitive.String()),
      });

      const doc = Document.make(schema);

      doc.root.items.push("first");
      doc.root.items.push("second");

      const snapshot = doc.toSnapshot();

      expect(snapshot?.items).toHaveLength(2);
      expect(snapshot?.items[0]?.value).toBe("first");
      expect(snapshot?.items[1]?.value).toBe("second");
    });
  });
});
