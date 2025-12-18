import type * as Operation from "./Operation";

// =============================================================================
// Transform Result Types
// =============================================================================

/**
 * Result of transforming an operation against another operation.
 */
export type TransformResult =
  | { type: "transformed"; operation: Operation.Operation<any, any, any> }
  | { type: "noop" } // Operation becomes a no-op (already superseded)
  | { type: "conflict"; reason: string };
