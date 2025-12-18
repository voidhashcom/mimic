import { describe, it, expect } from "vitest";
import * as Schema from "effect/Schema";
import * as Protocol from "../src/DocumentProtocol";

// =============================================================================
// Schema Tests
// =============================================================================

describe("DocumentProtocol", () => {
  describe("TransactionSchema", () => {
    it("should validate a valid transaction", () => {
      const transaction = {
        id: "tx-123",
        ops: [
          { kind: "string.set", path: { segments: ["title"] }, payload: "Hello" },
        ],
        timestamp: Date.now(),
      };

      const result = Schema.decodeUnknownSync(Protocol.TransactionSchema)(transaction);
      expect(result.id).toBe("tx-123");
      expect(result.ops).toHaveLength(1);
    });

    it("should reject invalid transaction", () => {
      const invalid = {
        id: 123, // should be string
        ops: [],
        timestamp: Date.now(),
      };

      expect(() =>
        Schema.decodeUnknownSync(Protocol.TransactionSchema)(invalid)
      ).toThrow();
    });
  });

  describe("TransactionMessageSchema", () => {
    it("should validate a transaction message", () => {
      const message = {
        type: "transaction",
        transaction: {
          id: "tx-456",
          ops: [],
          timestamp: Date.now(),
        },
        version: 1,
      };

      const result = Schema.decodeUnknownSync(Protocol.TransactionMessageSchema)(message);
      expect(result.type).toBe("transaction");
      expect(result.version).toBe(1);
    });
  });

  describe("SnapshotMessageSchema", () => {
    it("should validate a snapshot message", () => {
      const message = {
        type: "snapshot",
        state: { title: "Test", count: 42 },
        version: 5,
      };

      const result = Schema.decodeUnknownSync(Protocol.SnapshotMessageSchema)(message);
      expect(result.type).toBe("snapshot");
      expect(result.state).toEqual({ title: "Test", count: 42 });
      expect(result.version).toBe(5);
    });
  });

  describe("ErrorMessageSchema", () => {
    it("should validate an error message", () => {
      const message = {
        type: "error",
        transactionId: "tx-789",
        reason: "Transaction is empty",
      };

      const result = Schema.decodeUnknownSync(Protocol.ErrorMessageSchema)(message);
      expect(result.type).toBe("error");
      expect(result.transactionId).toBe("tx-789");
      expect(result.reason).toBe("Transaction is empty");
    });
  });

  describe("SubmitResultSchema", () => {
    it("should validate a success result", () => {
      const result = {
        success: true,
        version: 10,
      };

      const decoded = Schema.decodeUnknownSync(Protocol.SubmitResultSchema)(result);
      expect(decoded.success).toBe(true);
      if (decoded.success) {
        expect(decoded.version).toBe(10);
      }
    });

    it("should validate a failure result", () => {
      const result = {
        success: false,
        reason: "Invalid operation",
      };

      const decoded = Schema.decodeUnknownSync(Protocol.SubmitResultSchema)(result);
      expect(decoded.success).toBe(false);
      if (!decoded.success) {
        expect(decoded.reason).toBe("Invalid operation");
      }
    });
  });
});
