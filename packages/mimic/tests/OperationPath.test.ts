import { describe, expect, it } from "@effect/vitest";
import * as OperationPath from "../src/OperationPath";

describe("OperationPath", () => {
  describe("pathsOverlap", () => {
    it("should return true for identical paths", () => {
      const pathA = OperationPath.make("users/0/name");
      const pathB = OperationPath.make("users/0/name");

      expect(OperationPath.pathsOverlap(pathA, pathB)).toBe(true);
    });

    it("should return true when pathA is a prefix of pathB", () => {
      const pathA = OperationPath.make("users");
      const pathB = OperationPath.make("users/0/name");

      expect(OperationPath.pathsOverlap(pathA, pathB)).toBe(true);
    });

    it("should return true when pathB is a prefix of pathA", () => {
      const pathA = OperationPath.make("users/0/name");
      const pathB = OperationPath.make("users");

      expect(OperationPath.pathsOverlap(pathA, pathB)).toBe(true);
    });

    it("should return false for completely different paths", () => {
      const pathA = OperationPath.make("users/0/name");
      const pathB = OperationPath.make("settings/theme");

      expect(OperationPath.pathsOverlap(pathA, pathB)).toBe(false);
    });

    it("should return false for paths that diverge at some point", () => {
      const pathA = OperationPath.make("users/0/name");
      const pathB = OperationPath.make("users/1/name");

      expect(OperationPath.pathsOverlap(pathA, pathB)).toBe(false);
    });

    it("should return true for root paths", () => {
      const pathA = OperationPath.make("");
      const pathB = OperationPath.make("users/0/name");

      expect(OperationPath.pathsOverlap(pathA, pathB)).toBe(true);
    });

    it("should return true for both root paths", () => {
      const pathA = OperationPath.make("");
      const pathB = OperationPath.make("");

      expect(OperationPath.pathsOverlap(pathA, pathB)).toBe(true);
    });
  });

  describe("isPrefix", () => {
    it("should return true when pathA is a strict prefix of pathB", () => {
      const pathA = OperationPath.make("users");
      const pathB = OperationPath.make("users/0/name");

      expect(OperationPath.isPrefix(pathA, pathB)).toBe(true);
    });

    it("should return true for identical paths", () => {
      const pathA = OperationPath.make("users/0/name");
      const pathB = OperationPath.make("users/0/name");

      expect(OperationPath.isPrefix(pathA, pathB)).toBe(true);
    });

    it("should return false when pathA is longer than pathB", () => {
      const pathA = OperationPath.make("users/0/name");
      const pathB = OperationPath.make("users");

      expect(OperationPath.isPrefix(pathA, pathB)).toBe(false);
    });

    it("should return false for non-prefix paths", () => {
      const pathA = OperationPath.make("users/0");
      const pathB = OperationPath.make("settings/theme");

      expect(OperationPath.isPrefix(pathA, pathB)).toBe(false);
    });

    it("should return true when pathA is root", () => {
      const pathA = OperationPath.make("");
      const pathB = OperationPath.make("users/0/name");

      expect(OperationPath.isPrefix(pathA, pathB)).toBe(true);
    });
  });

  describe("pathsEqual", () => {
    it("should return true for identical paths", () => {
      const pathA = OperationPath.make("users/0/name");
      const pathB = OperationPath.make("users/0/name");

      expect(OperationPath.pathsEqual(pathA, pathB)).toBe(true);
    });

    it("should return false for different length paths", () => {
      const pathA = OperationPath.make("users");
      const pathB = OperationPath.make("users/0/name");

      expect(OperationPath.pathsEqual(pathA, pathB)).toBe(false);
    });

    it("should return false for same length but different paths", () => {
      const pathA = OperationPath.make("users/0/name");
      const pathB = OperationPath.make("users/1/name");

      expect(OperationPath.pathsEqual(pathA, pathB)).toBe(false);
    });

    it("should return true for both root paths", () => {
      const pathA = OperationPath.make("");
      const pathB = OperationPath.make("");

      expect(OperationPath.pathsEqual(pathA, pathB)).toBe(true);
    });
  });

  describe("getRelativePath", () => {
    it("should return remaining tokens when base is prefix", () => {
      const basePath = OperationPath.make("users");
      const fullPath = OperationPath.make("users/0/name");

      const result = OperationPath.getRelativePath(basePath, fullPath);

      expect(result).toEqual(["0", "name"]);
    });

    it("should return empty array for identical paths", () => {
      const basePath = OperationPath.make("users/0/name");
      const fullPath = OperationPath.make("users/0/name");

      const result = OperationPath.getRelativePath(basePath, fullPath);

      expect(result).toEqual([]);
    });

    it("should handle root base path", () => {
      const basePath = OperationPath.make("");
      const fullPath = OperationPath.make("users/0/name");

      const result = OperationPath.getRelativePath(basePath, fullPath);

      expect(result).toEqual(["users", "0", "name"]);
    });
  });
});
