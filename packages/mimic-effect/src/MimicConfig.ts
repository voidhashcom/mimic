/**
 * @since 0.0.1
 * Configuration types for the Mimic server.
 */
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import type { DurationInput } from "effect/Duration";
import * as Layer from "effect/Layer";
import type { Primitive } from "@voidhash/mimic";

// =============================================================================
// Schema Registry
// =============================================================================

/**
 * A registry that maps document type names to their Primitive schemas.
 */
export interface SchemaRegistry {
  /**
   * Get the schema for a document type.
   * @param documentType - The type/name of the document
   * @returns The Primitive schema or undefined if not found
   */
  readonly get: (documentType: string) => Primitive.AnyPrimitive | undefined;

  /**
   * List all registered document types.
   */
  readonly types: () => ReadonlyArray<string>;
}

/**
 * Create a SchemaRegistry from a record of schemas.
 */
export const makeSchemaRegistry = (
  schemas: Record<string, Primitive.AnyPrimitive>
): SchemaRegistry => ({
  get: (documentType: string) => schemas[documentType],
  types: () => Object.keys(schemas),
});

// =============================================================================
// Authentication
// =============================================================================

/**
 * Result of an authentication attempt.
 */
export type AuthResult =
  | { readonly success: true; readonly userId?: string }
  | { readonly success: false; readonly error: string };

/**
 * Authentication handler function.
 */
export type AuthHandler = (token: string) => Promise<AuthResult> | AuthResult;

// =============================================================================
// Persistence Mode
// =============================================================================

/**
 * Persistence mode for document entities.
 */
export type PersistenceMode =
  | { readonly type: "in-memory" }
  | { readonly type: "persistent" };

// =============================================================================
// Mimic Server Configuration
// =============================================================================

/**
 * Configuration for the Mimic server.
 */
export interface MimicServerConfig {
  /**
   * Registry of document schemas.
   */
  readonly schemaRegistry: SchemaRegistry;

  /**
   * Optional authentication handler.
   * If not provided, authentication is disabled.
   */
  readonly authHandler?: AuthHandler;

  /**
   * Persistence mode for document entities.
   * @default { type: "in-memory" }
   */
  readonly persistenceMode: PersistenceMode;

  /**
   * Maximum idle time for an entity before it is cleaned up.
   * @default "5 minutes"
   */
  readonly maxIdleTime: Duration.Duration;

  /**
   * Maximum number of processed transaction IDs to track for deduplication.
   * @default 1000
   */
  readonly maxTransactionHistory: number;

  /**
   * Heartbeat interval for WebSocket connections.
   * @default "30 seconds"
   */
  readonly heartbeatInterval: Duration.Duration;

  /**
   * Timeout for heartbeat responses before considering connection dead.
   * @default "10 seconds"
   */
  readonly heartbeatTimeout: Duration.Duration;
}

/**
 * Options for creating a MimicServerConfig.
 */
export interface MimicServerConfigOptions {
  /**
   * Registry of document schemas, or a record of schemas to create a registry.
   */
  readonly schemas:
    | SchemaRegistry
    | Record<string, Primitive.AnyPrimitive>;

  /**
   * Optional authentication handler.
   */
  readonly authHandler?: AuthHandler;

  /**
   * Persistence mode for document entities.
   * @default { type: "in-memory" }
   */
  readonly persistenceMode?: PersistenceMode;

  /**
   * Maximum idle time for an entity before it is cleaned up.
   * @default "5 minutes"
   */
  readonly maxIdleTime?: DurationInput;

  /**
   * Maximum number of processed transaction IDs to track for deduplication.
   * @default 1000
   */
  readonly maxTransactionHistory?: number;

  /**
   * Heartbeat interval for WebSocket connections.
   * @default "30 seconds"
   */
  readonly heartbeatInterval?: DurationInput;

  /**
   * Timeout for heartbeat responses.
   * @default "10 seconds"
   */
  readonly heartbeatTimeout?: DurationInput;
}

/**
 * Check if an object is a SchemaRegistry.
 */
const isSchemaRegistry = (obj: unknown): obj is SchemaRegistry =>
  typeof obj === "object" &&
  obj !== null &&
  "get" in obj &&
  "types" in obj &&
  typeof (obj as SchemaRegistry).get === "function" &&
  typeof (obj as SchemaRegistry).types === "function";

/**
 * Create a MimicServerConfig from options.
 */
export const make = (options: MimicServerConfigOptions): MimicServerConfig => {
  const schemaRegistry = isSchemaRegistry(options.schemas)
    ? options.schemas
    : makeSchemaRegistry(options.schemas);

  return {
    schemaRegistry,
    authHandler: options.authHandler,
    persistenceMode: options.persistenceMode ?? { type: "in-memory" },
    maxIdleTime: Duration.decode(options.maxIdleTime ?? "5 minutes"),
    maxTransactionHistory: options.maxTransactionHistory ?? 1000,
    heartbeatInterval: Duration.decode(options.heartbeatInterval ?? "30 seconds"),
    heartbeatTimeout: Duration.decode(options.heartbeatTimeout ?? "10 seconds"),
  };
};

// =============================================================================
// Context Tag
// =============================================================================

/**
 * Context tag for MimicServerConfig.
 */
export class MimicServerConfigTag extends Context.Tag(
  "@voidhash/mimic-server-effect/MimicServerConfig"
)<MimicServerConfigTag, MimicServerConfig>() {}

/**
 * Create a Layer that provides MimicServerConfig.
 */
export const layer = (
  options: MimicServerConfigOptions
): Layer.Layer<MimicServerConfigTag> =>
  Layer.succeed(MimicServerConfigTag, make(options));
