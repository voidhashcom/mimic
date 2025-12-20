/**
 * @since 0.0.1
 * No authentication implementation for Mimic connections.
 * All connections are automatically authenticated (open access).
 */
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import {
  MimicAuthServiceTag,
  type MimicAuthService,
} from "../MimicAuthService.js";

// =============================================================================
// No-Auth Implementation
// =============================================================================

/**
 * Authentication service that auto-succeeds all authentication requests.
 * Use this for development or when authentication is handled externally.
 */
const noAuthService: MimicAuthService = {
  authenticate: (_token: string) =>
    Effect.succeed({ success: true as const }),
};

// =============================================================================
// Layer
// =============================================================================

/**
 * Layer that provides no authentication (open access).
 * All connections are automatically authenticated.
 * 
 * WARNING: Only use this for development or when authentication
 * is handled at a different layer (e.g., API gateway, reverse proxy).
 */
export const layer: Layer.Layer<MimicAuthServiceTag> = Layer.succeed(
  MimicAuthServiceTag,
  noAuthService
);

/**
 * Default layer alias for convenience.
 */
export const layerDefault = layer;
