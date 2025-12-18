// export type OperationPath = string
export type OperationPathToken = string

export interface OperationPath {
    readonly _tag: "OperationPath"
    readonly toTokens: () => ReadonlyArray<OperationPathToken>
    readonly concat: (other: OperationPath) => OperationPath
    readonly append: (token: OperationPathToken) => OperationPath
    readonly pop: () => OperationPath
    readonly shift: () => OperationPath
}

const parseStringPath = (stringPath: string): ReadonlyArray<OperationPathToken> => {
    return stringPath.split("/")
}

const makeStringPathFromTokens = (tokens: ReadonlyArray<OperationPathToken>): string => {
    return tokens.join("/")
}

/**
 * Creates a new operation path.
 * @param stringPath - The string path to create the path from.
 * @returns The new operation path.
 */
export function make(stringPath?: string): OperationPath {

    const tokensInternal: ReadonlyArray<OperationPathToken> = stringPath ? parseStringPath(stringPath) : []

    /**
     * Returns the tokens of the path.
     * @returns The tokens of the path.
     */
    const toTokens = () => {
        return tokensInternal
    }

    /**
     * Concatenates two paths.
     * @param other - The other path to concatenate.
     * @returns The new path.
     */
    const concat = (other: OperationPath): OperationPath => {
        return make(makeStringPathFromTokens(toTokens().concat(other.toTokens())))
    }

    /**
     * Appends a token to the path.
     * @param token - The token to append.
     * @returns The new path.
     */
    const append = (token: OperationPathToken): OperationPath => {
        return make(makeStringPathFromTokens(toTokens().concat([token])))
    }

    /**
     * Removes the last token from the path.
     * @returns The new path.
     */
    const pop = (): OperationPath => {
        return make(makeStringPathFromTokens(toTokens().slice(0, -1)))
    }

    /**
     * Removes the first token from the path.
     * @returns The new path.
     */
    const shift = (): OperationPath => {
        return make(makeStringPathFromTokens(toTokens().slice(1)))
    }

    return {
        _tag: "OperationPath",
        toTokens,
        concat,
        append,
        pop,
        shift
    } as const
}

/**
 * Creates a new operation path from tokens.
 * @param tokens - The tokens to create the path from.
 * @returns The new operation path.
 */
export function fromTokens(tokens: ReadonlyArray<OperationPathToken>): OperationPath {
    return make(makeStringPathFromTokens(tokens))
}

// =============================================================================
// Path Utility Functions
// =============================================================================

/**
 * Checks if two operation paths overlap (one is prefix of the other or equal).
 */
export const pathsOverlap = (
  pathA: OperationPath,
  pathB: OperationPath
): boolean => {
  const tokensA = pathA.toTokens().filter((t) => t !== "");
  const tokensB = pathB.toTokens().filter((t) => t !== "");

  const minLength = Math.min(tokensA.length, tokensB.length);

  for (let i = 0; i < minLength; i++) {
    if (tokensA[i] !== tokensB[i]) {
      return false;
    }
  }

  return true;
};

/**
 * Checks if pathA is a prefix of pathB (pathA is ancestor of pathB).
 */
export const isPrefix = (
  pathA: OperationPath,
  pathB: OperationPath
): boolean => {
  const tokensA = pathA.toTokens().filter((t) => t !== "");
  const tokensB = pathB.toTokens().filter((t) => t !== "");

  if (tokensA.length > tokensB.length) {
    return false;
  }

  for (let i = 0; i < tokensA.length; i++) {
    if (tokensA[i] !== tokensB[i]) {
      return false;
    }
  }

  return true;
};

/**
 * Checks if two paths are exactly equal.
 */
export const pathsEqual = (
  pathA: OperationPath,
  pathB: OperationPath
): boolean => {
  const tokensA = pathA.toTokens().filter((t) => t !== "");
  const tokensB = pathB.toTokens().filter((t) => t !== "");

  if (tokensA.length !== tokensB.length) {
    return false;
  }

  for (let i = 0; i < tokensA.length; i++) {
    if (tokensA[i] !== tokensB[i]) {
      return false;
    }
  }

  return true;
};

/**
 * Gets the relative path of pathB with respect to pathA.
 * Assumes pathA is a prefix of pathB.
 */
export const getRelativePath = (
  basePath: OperationPath,
  fullPath: OperationPath
): string[] => {
  const baseTokens = basePath.toTokens().filter((t) => t !== "");
  const fullTokens = fullPath.toTokens().filter((t) => t !== "");

  return fullTokens.slice(baseTokens.length);
};