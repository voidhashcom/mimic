import { describe, it, expect } from "vitest";
import { Effect } from "effect";
import * as Protocol from "../src/Protocol";
import { Transaction, Document, Primitive } from "@voidhash/mimic";

describe("Protocol", () => {
  describe("parseClientMessage", () => {
    it("should parse auth message", async () => {
      const data = JSON.stringify({ type: "auth", token: "test-token" });

      const result = await Effect.runPromise(Protocol.parseClientMessage(data));

      expect(result.type).toBe("auth");
      expect((result as Protocol.AuthMessage).token).toBe("test-token");
    });

    it("should parse ping message", async () => {
      const data = JSON.stringify({ type: "ping" });

      const result = await Effect.runPromise(Protocol.parseClientMessage(data));

      expect(result.type).toBe("ping");
    });

    it("should parse request_snapshot message", async () => {
      const data = JSON.stringify({ type: "request_snapshot" });

      const result = await Effect.runPromise(Protocol.parseClientMessage(data));

      expect(result.type).toBe("request_snapshot");
    });

    it("should parse presence_set message", async () => {
      const data = JSON.stringify({
        type: "presence_set",
        data: { cursor: { x: 10, y: 20 } },
      });

      const result = await Effect.runPromise(Protocol.parseClientMessage(data));

      expect(result.type).toBe("presence_set");
      expect((result as Protocol.PresenceSetMessage).data).toEqual({
        cursor: { x: 10, y: 20 },
      });
    });

    it("should parse presence_clear message", async () => {
      const data = JSON.stringify({ type: "presence_clear" });

      const result = await Effect.runPromise(Protocol.parseClientMessage(data));

      expect(result.type).toBe("presence_clear");
    });

    it("should parse submit message with transaction", async () => {
      // Create a real transaction using the Document API
      const schema = Primitive.Struct({
        title: Primitive.String().default(""),
      });
      const doc = Document.make(schema);
      doc.transaction((root) => root.title.set("Test"));
      const tx = doc.flush();
      const encodedTx = Transaction.encode(tx);

      const data = JSON.stringify({
        type: "submit",
        transaction: encodedTx,
      });

      const result = await Effect.runPromise(Protocol.parseClientMessage(data));

      expect(result.type).toBe("submit");
      const submitResult = result as Protocol.SubmitMessage;
      expect(submitResult.transaction.id).toBe(tx.id);
    });

    it("should fail on invalid JSON", async () => {
      const result = await Effect.runPromise(
        Effect.either(Protocol.parseClientMessage("not json"))
      );

      expect(result._tag).toBe("Left");
    });

    it("should handle Uint8Array input", async () => {
      const data = new TextEncoder().encode(
        JSON.stringify({ type: "ping" })
      );

      const result = await Effect.runPromise(Protocol.parseClientMessage(data));

      expect(result.type).toBe("ping");
    });
  });

  describe("encodeServerMessage", () => {
    it("should encode auth_result success", () => {
      const message = Protocol.authResultSuccess("user-1", "write");
      const encoded = Protocol.encodeServerMessage(message);
      const parsed = JSON.parse(encoded);

      expect(parsed.type).toBe("auth_result");
      expect(parsed.success).toBe(true);
      expect(parsed.userId).toBe("user-1");
      expect(parsed.permission).toBe("write");
    });

    it("should encode auth_result failure", () => {
      const message = Protocol.authResultFailure("Invalid token");
      const encoded = Protocol.encodeServerMessage(message);
      const parsed = JSON.parse(encoded);

      expect(parsed.type).toBe("auth_result");
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe("Invalid token");
    });

    it("should encode pong", () => {
      const message = Protocol.pong();
      const encoded = Protocol.encodeServerMessage(message);
      const parsed = JSON.parse(encoded);

      expect(parsed.type).toBe("pong");
    });

    it("should encode snapshot", () => {
      const message = Protocol.snapshotMessage({ title: "Test" }, 5);
      const encoded = Protocol.encodeServerMessage(message);
      const parsed = JSON.parse(encoded);

      expect(parsed.type).toBe("snapshot");
      expect(parsed.state).toEqual({ title: "Test" });
      expect(parsed.version).toBe(5);
    });

    it("should encode error", () => {
      const message = Protocol.errorMessage("tx-1", "Transaction rejected");
      const encoded = Protocol.encodeServerMessage(message);
      const parsed = JSON.parse(encoded);

      expect(parsed.type).toBe("error");
      expect(parsed.transactionId).toBe("tx-1");
      expect(parsed.reason).toBe("Transaction rejected");
    });

    it("should encode presence_update", () => {
      const message = Protocol.presenceUpdateMessage("conn-1", { x: 10 }, "user-1");
      const encoded = Protocol.encodeServerMessage(message);
      const parsed = JSON.parse(encoded);

      expect(parsed.type).toBe("presence_update");
      expect(parsed.id).toBe("conn-1");
      expect(parsed.data).toEqual({ x: 10 });
      expect(parsed.userId).toBe("user-1");
    });

    it("should encode presence_remove", () => {
      const message = Protocol.presenceRemoveMessage("conn-1");
      const encoded = Protocol.encodeServerMessage(message);
      const parsed = JSON.parse(encoded);

      expect(parsed.type).toBe("presence_remove");
      expect(parsed.id).toBe("conn-1");
    });

    it("should encode presence_snapshot", () => {
      const message = Protocol.presenceSnapshotMessage("self-id", {
        "conn-1": { data: { x: 10 } },
      });
      const encoded = Protocol.encodeServerMessage(message);
      const parsed = JSON.parse(encoded);

      expect(parsed.type).toBe("presence_snapshot");
      expect(parsed.selfId).toBe("self-id");
      expect(parsed.presences["conn-1"].data).toEqual({ x: 10 });
    });

    it("should encode transaction with encoded transaction", () => {
      const tx = Transaction.make([]);
      const message = Protocol.transactionMessage(tx, 3);
      const encoded = Protocol.encodeServerMessage(message);
      const parsed = JSON.parse(encoded);

      expect(parsed.type).toBe("transaction");
      expect(parsed.version).toBe(3);
      expect(parsed.transaction).toBeDefined();
      expect(parsed.transaction.id).toBe(tx.id);
    });
  });
});
