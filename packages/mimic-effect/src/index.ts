/**
 * @voidhash/mimic-effect
 *
 * Server-side Effect integration for Mimic real-time collaboration.
 *
 * @since 0.0.9
 */

// =============================================================================
// Main Exports
// =============================================================================

export { MimicServerEngine, MimicServerEngineTag } from "./MimicServerEngine";
export { MimicClusterServerEngine } from "./MimicClusterServerEngine";
export { MimicServer, type MimicServerRouteConfig } from "./MimicServer";
export { ColdStorage, ColdStorageTag } from "./ColdStorage";
export { HotStorage, HotStorageTag } from "./HotStorage";
export { MimicAuthService, MimicAuthServiceTag } from "./MimicAuthService";
export { MimicMetrics } from "./Metrics";

// =============================================================================
// Types
// =============================================================================

export type * from "./Types";

// =============================================================================
// Errors
// =============================================================================

export * from "./Errors";

// =============================================================================
// Protocol (for custom implementations)
// =============================================================================

export * as Protocol from "./Protocol";

// =============================================================================
// Internal Exports (for advanced use cases)
// =============================================================================

export {
  DocumentInstance,
  type DocumentInstance as DocumentInstanceInterface,
  type SubmitResult,
} from "./DocumentInstance";

export {
  PresenceManager,
  PresenceManagerTag,
} from "./PresenceManager";
