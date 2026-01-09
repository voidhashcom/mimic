/**
 * @voidhash/mimic-react/zustand
 *
 * Zustand middleware for integrating mimic ClientDocument with reactive state.
 *
 * @since 0.0.1
 */

// =============================================================================
// Middleware
// =============================================================================

export { mimic } from "./middleware";

// =============================================================================
// Types
// =============================================================================

export type {
  MimicObject,
  MimicSlice,
  MimicMiddlewareOptions,
  MimicStateCreator,
} from "./types";
