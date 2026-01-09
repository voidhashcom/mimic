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

export { MimicServerEngine, MimicServerEngineTag } from "./MimicServerEngine.js";
export { MimicClusterServerEngine } from "./MimicClusterServerEngine.js";
export { MimicServer, type MimicServerRouteConfig } from "./MimicServer.js";
export { ColdStorage, ColdStorageTag } from "./ColdStorage.js";
export { HotStorage, HotStorageTag } from "./HotStorage.js";
export { MimicAuthService, MimicAuthServiceTag } from "./MimicAuthService.js";
export { MimicMetrics } from "./Metrics.js";

// =============================================================================
// Types
// =============================================================================

export type {
  Permission,
  AuthContext,
  StoredDocument,
  WalEntry,
  PresenceEntry,
  PresenceSnapshot,
  PresenceEvent,
  PresenceUpdateEvent,
  PresenceRemoveEvent,
  DurationInput,
  SnapshotConfig,
  InitialContext,
  InitialFn,
  Initial,
  MimicServerEngineConfig,
  MimicClusterServerEngineConfig,
  ResolvedConfig,
  ResolvedClusterConfig,
  ResolvedRouteConfig,
} from "./Types.js";

// =============================================================================
// Errors
// =============================================================================

export {
  ColdStorageError,
  HotStorageError,
  AuthenticationError,
  AuthorizationError,
  MissingDocumentIdError,
  MessageParseError,
  TransactionRejectedError,
  type MimicError,
} from "./Errors.js";

// =============================================================================
// Protocol (for custom implementations)
// =============================================================================

export * as Protocol from "./Protocol.js";

// =============================================================================
// Internal Exports (for advanced use cases)
// =============================================================================

export {
  DocumentManager,
  DocumentManagerTag,
  DocumentManagerConfigTag,
  type SubmitResult,
} from "./DocumentManager.js";

export {
  PresenceManager,
  PresenceManagerTag,
} from "./PresenceManager.js";
