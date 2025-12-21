/**
 * @voidhash/mimic-server-effect
 *
 * Effect-based server implementation for Mimic sync engine.
 *
 * @since 0.0.1
 */

// =============================================================================
// Main Server
// =============================================================================

export * as MimicServer from "./MimicServer.js";

// =============================================================================
// Service Interfaces
// =============================================================================

export * as MimicDataStorage from "./MimicDataStorage.js";
export * as MimicAuthService from "./MimicAuthService.js";

// =============================================================================
// Default Implementations
// =============================================================================

export * as MimicInMemoryDataStorage from "./storage/InMemoryDataStorage.js";
export * as MimicNoAuth from "./auth/NoAuth.js";

// =============================================================================
// Configuration
// =============================================================================

export * as MimicConfig from "./MimicConfig.js";

// =============================================================================
// Internal Components (for advanced usage)
// =============================================================================

export * as DocumentManager from "./DocumentManager.js";
export * as PresenceManager from "./PresenceManager.js";
export * as WebSocketHandler from "./WebSocketHandler.js";
export * as DocumentProtocol from "./DocumentProtocol.js";

// =============================================================================
// Errors
// =============================================================================

export * from "./errors.js";
