/**
 * @since 0.0.1
 * Configuration types for the Mimic server.
 */
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import type { DurationInput } from "effect/Duration";
import * as Layer from "effect/Layer";
import type { Primitive, Presence } from "@voidhash/mimic";

// =============================================================================
// Mimic Server Configuration
// =============================================================================

/**
 * Configuration for the Mimic server.
 * 
 * Note: Authentication and persistence are now handled by injectable services
 * (MimicAuthService and MimicDataStorage) rather than config options.
 */
export interface MimicServerConfig<TSchema extends Primitive.AnyPrimitive = Primitive.AnyPrimitive> {
  /**
   * The schema defining the document structure.
   */
  readonly schema: TSchema;

  /**
   * Maximum idle time for a document before it is cleaned up.
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

  /**
   * Optional presence schema for ephemeral per-user data.
   * When provided, enables presence features on WebSocket connections.
   * @default undefined (presence disabled)
   */
  readonly presence: Presence.AnyPresence | undefined;
}

/**
 * Options for creating a MimicServerConfig.
 */
export interface MimicServerConfigOptions<TSchema extends Primitive.AnyPrimitive = Primitive.AnyPrimitive> {
  /**
   * The schema defining the document structure.
   */
  readonly schema: TSchema;

  /**
   * Maximum idle time for a document before it is cleaned up.
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

  /**
   * Optional presence schema for ephemeral per-user data.
   * When provided, enables presence features on WebSocket connections.
   * @default undefined (presence disabled)
   */
  readonly presence?: Presence.AnyPresence;
}

/**
 * Create a MimicServerConfig from options.
 */
export const make = <TSchema extends Primitive.AnyPrimitive>(
  options: MimicServerConfigOptions<TSchema>
): MimicServerConfig<TSchema> => ({
  schema: options.schema,
  maxIdleTime: Duration.decode(options.maxIdleTime ?? "5 minutes"),
  maxTransactionHistory: options.maxTransactionHistory ?? 1000,
  heartbeatInterval: Duration.decode(options.heartbeatInterval ?? "30 seconds"),
  heartbeatTimeout: Duration.decode(options.heartbeatTimeout ?? "10 seconds"),
  presence: options.presence,
});

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
export const layer = <TSchema extends Primitive.AnyPrimitive>(
  options: MimicServerConfigOptions<TSchema>
): Layer.Layer<MimicServerConfigTag> =>
  Layer.succeed(MimicServerConfigTag, make(options));
