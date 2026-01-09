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
} from "./Types";

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
} from "./Errors";

// =============================================================================
// Protocol (for custom implementations)
// =============================================================================

export * as Protocol from "./Protocol";

// =============================================================================
// Internal Exports (for advanced use cases)
// =============================================================================

export {
  DocumentManager,
  DocumentManagerTag,
  DocumentManagerConfigTag,
  type SubmitResult,
} from "./DocumentManager";

export {
  PresenceManager,
  PresenceManagerTag,
} from "./PresenceManager";
