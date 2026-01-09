/**
 * @voidhash/mimic-effect - MimicAuthService
 *
 * Authentication and authorization service interface and implementations.
 */
import { Context, Effect, Layer } from "effect";
import type { AuthContext, Permission } from "./Types.js";
import { AuthenticationError } from "./Errors.js";

// =============================================================================
// MimicAuthService Interface
// =============================================================================

/**
 * MimicAuthService interface for authentication and authorization.
 *
 * The `authenticate` method receives the token from the client's auth message
 * and the document ID being accessed. It should return an AuthContext on success
 * or fail with AuthenticationError on failure.
 *
 * The permission in AuthContext determines what the user can do:
 * - "read": Can subscribe, receive transactions, get snapshots
 * - "write": All of the above, plus can submit transactions and set presence
 */
export interface MimicAuthService {
  /**
   * Authenticate a connection and return authorization context.
   *
   * @param token - The token provided by the client
   * @param documentId - The document ID being accessed
   * @returns AuthContext with userId and permission level
   */
  readonly authenticate: (
    token: string,
    documentId: string
  ) => Effect.Effect<AuthContext, AuthenticationError>;
}

// =============================================================================
// Context Tag
// =============================================================================

/**
 * Context tag for MimicAuthService
 */
export class MimicAuthServiceTag extends Context.Tag(
  "@voidhash/mimic-effect/MimicAuthService"
)<MimicAuthServiceTag, MimicAuthService>() {}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a MimicAuthService layer from an Effect that produces the service.
 *
 * This allows you to access other Effect services when implementing authentication.
 *
 * @example
 * ```typescript
 * const Auth = MimicAuthService.make(
 *   Effect.gen(function*() {
 *     const db = yield* DatabaseService
 *     const jwt = yield* JwtService
 *
 *     return {
 *       authenticate: (token, documentId) =>
 *         Effect.gen(function*() {
 *           const payload = yield* jwt.verify(token).pipe(
 *             Effect.mapError(() => new AuthenticationError({ reason: "Invalid token" }))
 *           )
 *
 *           const permission = yield* db.getDocumentPermission(payload.userId, documentId)
 *
 *           return { userId: payload.userId, permission }
 *         })
 *     }
 *   })
 * )
 * ```
 */
export const make = <E, R>(
  effect: Effect.Effect<MimicAuthService, E, R>
): Layer.Layer<MimicAuthServiceTag, E, R> =>
  Layer.effect(MimicAuthServiceTag, effect);

// =============================================================================
// NoAuth Implementation
// =============================================================================

/**
 * No-authentication implementation.
 *
 * Everyone gets write access with userId "anonymous".
 * ONLY USE FOR DEVELOPMENT/TESTING.
 */
export namespace NoAuth {
  /**
   * Create a NoAuth layer.
   * All connections are authenticated with write permission.
   */
  export const make = (): Layer.Layer<MimicAuthServiceTag> =>
    Layer.succeed(MimicAuthServiceTag, {
      authenticate: (_token, _documentId) =>
        Effect.succeed({
          userId: "anonymous",
          permission: "write" as const,
        }),
    });
}

// =============================================================================
// Static Implementation
// =============================================================================

/**
 * Static permissions implementation.
 *
 * Permissions are defined at configuration time.
 * The token is treated as the userId.
 */
export namespace Static {
  export interface Options {
    /**
     * Map of userId (token) to permission level
     */
    readonly permissions: Record<string, Permission>;
    /**
     * Default permission for users not in the permissions map.
     * If undefined, unknown users will fail authentication.
     */
    readonly defaultPermission?: Permission;
  }

  /**
   * Create a Static auth layer.
   * The token is treated as the userId, and permissions are looked up from the config.
   */
  export const make = (options: Options): Layer.Layer<MimicAuthServiceTag> =>
    Layer.succeed(MimicAuthServiceTag, {
      authenticate: (token, _documentId) => {
        const permission = options.permissions[token] ?? options.defaultPermission;
        if (permission === undefined) {
          return Effect.fail(
            new AuthenticationError({ reason: "Unknown user" })
          );
        }
        return Effect.succeed({
          userId: token,
          permission,
        });
      },
    });
}

// =============================================================================
// Re-export namespace
// =============================================================================

export const MimicAuthService = {
  Tag: MimicAuthServiceTag,
  make,
  NoAuth,
  Static,
};
