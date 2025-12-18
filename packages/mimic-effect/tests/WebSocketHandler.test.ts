import { describe, it, expect } from "vitest";
import * as Effect from "effect/Effect";
import * as WebSocketHandler from "../src/WebSocketHandler";
import { MissingDocumentIdError } from "../src/errors";

// =============================================================================
// extractDocumentId Tests
// =============================================================================

describe("WebSocketHandler", () => {
  describe("extractDocumentId", () => {
    it("should extract document ID from /doc/{id} path", () => {
      const result = Effect.runSync(
        WebSocketHandler.extractDocumentId("/doc/my-document-id")
      );
      expect(result).toBe("my-document-id");
    });

    it("should extract document ID from /doc/{id} with leading slashes", () => {
      const result = Effect.runSync(
        WebSocketHandler.extractDocumentId("///doc/my-document-id")
      );
      expect(result).toBe("my-document-id");
    });

    it("should extract document ID from /{id} path (short form)", () => {
      const result = Effect.runSync(
        WebSocketHandler.extractDocumentId("/my-document-id")
      );
      expect(result).toBe("my-document-id");
    });

    it("should handle URL-encoded document IDs", () => {
      const result = Effect.runSync(
        WebSocketHandler.extractDocumentId("/doc/my%20document%3Aid")
      );
      expect(result).toBe("my document:id");
    });

    it("should handle document IDs with colons (type:id format)", () => {
      const result = Effect.runSync(
        WebSocketHandler.extractDocumentId("/doc/todo:abc-123")
      );
      expect(result).toBe("todo:abc-123");
    });

    it("should fail for empty path", () => {
      const result = Effect.runSyncExit(
        WebSocketHandler.extractDocumentId("/")
      );
      expect(result._tag).toBe("Failure");
    });

    it("should fail for /doc without document ID", () => {
      const result = Effect.runSyncExit(
        WebSocketHandler.extractDocumentId("/doc")
      );
      expect(result._tag).toBe("Failure");
    });

    it("should fail for /doc/ without document ID", () => {
      const result = Effect.runSyncExit(
        WebSocketHandler.extractDocumentId("/doc/")
      );
      // This will fail because after split, parts[1] will be empty string
      expect(result._tag).toBe("Failure");
    });
  });
});
