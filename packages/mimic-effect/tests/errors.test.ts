import { describe, it, expect } from "vitest";
import * as errors from "../src/errors";

// =============================================================================
// Error Tests
// =============================================================================

describe("errors", () => {
  describe("DocumentTypeNotFoundError", () => {
    it("should have correct message", () => {
      const error = new errors.DocumentTypeNotFoundError({
        documentType: "unknown-type",
      });
      expect(error.message).toBe("Document type not found: unknown-type");
      expect(error._tag).toBe("DocumentTypeNotFoundError");
    });
  });

  describe("DocumentNotFoundError", () => {
    it("should have correct message", () => {
      const error = new errors.DocumentNotFoundError({
        documentId: "doc-123",
      });
      expect(error.message).toBe("Document not found: doc-123");
      expect(error._tag).toBe("DocumentNotFoundError");
    });
  });

  describe("AuthenticationError", () => {
    it("should have correct message", () => {
      const error = new errors.AuthenticationError({
        reason: "Invalid token",
      });
      expect(error.message).toBe("Authentication failed: Invalid token");
      expect(error._tag).toBe("AuthenticationError");
    });
  });

  describe("TransactionRejectedError", () => {
    it("should have correct message", () => {
      const error = new errors.TransactionRejectedError({
        transactionId: "tx-456",
        reason: "Transaction is empty",
      });
      expect(error.message).toBe("Transaction tx-456 rejected: Transaction is empty");
      expect(error._tag).toBe("TransactionRejectedError");
    });
  });

  describe("MessageParseError", () => {
    it("should have correct message", () => {
      const error = new errors.MessageParseError({
        cause: new SyntaxError("Unexpected token"),
      });
      expect(error.message).toContain("Failed to parse message");
      expect(error._tag).toBe("MessageParseError");
    });
  });

  describe("InvalidConnectionError", () => {
    it("should have correct message", () => {
      const error = new errors.InvalidConnectionError({
        reason: "Connection closed",
      });
      expect(error.message).toBe("Invalid connection: Connection closed");
      expect(error._tag).toBe("InvalidConnectionError");
    });
  });

  describe("MissingDocumentIdError", () => {
    it("should have correct message", () => {
      const error = new errors.MissingDocumentIdError({});
      expect(error.message).toBe("Document ID is required in the URL path");
      expect(error._tag).toBe("MissingDocumentIdError");
    });
  });
});
