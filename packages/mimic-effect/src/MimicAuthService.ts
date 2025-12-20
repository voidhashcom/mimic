/**
 * @since 0.0.1
 * Authentication service interface for Mimic connections.
 * Provides pluggable authentication adapters.
 */
import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";

// =============================================================================
// Authentication Types
// =============================================================================

/**
 * Result of an authentication attempt.
 */
export type AuthResult =
  | { readonly success: true; readonly userId?: string }
  | { readonly success: false; readonly error: string };

/**
 * Authentication handler function type.
 * Can be synchronous or return a Promise.
 */
export type AuthHandler = (token: string) => Promise<AuthResult> | AuthResult;

// =============================================================================
// Auth Service Interface
// =============================================================================

/**
 * Authentication service interface.
 * Implementations can authenticate connections using various methods (JWT, API keys, etc.)
 */
export interface MimicAuthService {
  /**
   * Authenticate a connection using the provided token.
   * @param token - The authentication token provided by the client
   * @returns The authentication result
   */
  readonly authenticate: (token: string) => Effect.Effect<AuthResult>;
}

// =============================================================================
// Context Tag
// =============================================================================

/**
 * Context tag for MimicAuthService service.
 */
export class MimicAuthServiceTag extends Context.Tag(
  "@voidhash/mimic-server-effect/MimicAuthService"
)<MimicAuthServiceTag, MimicAuthService>() {}

// =============================================================================
// Layer Constructors
// =============================================================================

/**
 * Create a MimicAuthService layer from an auth handler function.
 */
export const layer = (options: {
  readonly authHandler: AuthHandler;
}): Layer.Layer<MimicAuthServiceTag> =>
  Layer.succeed(MimicAuthServiceTag, {
    authenticate: (token: string) =>
      Effect.promise(() => Promise.resolve(options.authHandler(token))),
  });

/**
 * Create a MimicAuthService layer from an auth service implementation.
 */
export const layerService = (service: MimicAuthService): Layer.Layer<MimicAuthServiceTag> =>
  Layer.succeed(MimicAuthServiceTag, service);

/**
 * Create a MimicAuthService layer from an Effect that produces an auth service.
 */
export const layerEffect = <E, R>(
  effect: Effect.Effect<MimicAuthService, E, R>
): Layer.Layer<MimicAuthServiceTag, E, R> =>
  Layer.effect(MimicAuthServiceTag, effect);

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Create an auth service from an auth handler function.
 */
export const make = (authHandler: AuthHandler): MimicAuthService => ({
  authenticate: (token: string) =>
    Effect.promise(() => Promise.resolve(authHandler(token))),
});

/**
 * Create an auth service from an Effect-based authenticate function.
 */
export const makeEffect = (
  authenticate: (token: string) => Effect.Effect<AuthResult>
): MimicAuthService => ({
  authenticate,
});
