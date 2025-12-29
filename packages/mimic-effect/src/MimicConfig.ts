/**
 * @since 0.0.1
 * Configuration types for the Mimic server.
 */
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import type { DurationInput } from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Primitive, Presence } from "@voidhash/mimic";

// =============================================================================
// Initial State Types
// =============================================================================

/**
 * Context available when computing initial state for a document.
 */
export interface InitialContext {
  /**
   * The document ID being initialized.
   */
  readonly documentId: string;
}

/**
 * Function that computes initial state for a document.
 * Receives context with the document ID and returns an Effect that produces the initial state.
 */
export type InitialFn<TSchema extends Primitive.AnyPrimitive> = (
  context: InitialContext
) => Effect.Effect<Primitive.InferSetInput<TSchema>>;

// =============================================================================
// Mimic Server Configuration
// =============================================================================

/**
 * Configuration for the Mimic server.
 * 
 * Note: Authentication and persistence are now handled by injectable services
 * (MimicAuthService and MimicDataStorage) rather than config options.
 */
export interface MimicServerConfig<
  TSchema extends Primitive.AnyPrimitive = Primitive.AnyPrimitive,
> {
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

  /**
   * Initial state function for new documents.
   * Called when a document is created and no existing state is found in storage.
   * Receives the document ID and returns an Effect that produces the initial state.
   * @default undefined (documents start empty or use schema defaults)
   */
  readonly initial: InitialFn<TSchema> | undefined;
}

/**
 * Options for creating a MimicServerConfig.
 */
export interface MimicServerConfigOptions<
  TSchema extends Primitive.AnyPrimitive = Primitive.AnyPrimitive,
> {
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

  /**
   * Initial state for new documents.
   * Can be either:
   * - A plain object with the initial state values
   * - A function that receives context (with documentId) and returns an Effect producing the initial state
   *
   * Type-safe: required fields (without defaults) must be provided,
   * while optional fields and fields with defaults can be omitted.
   *
   * @example
   * // Plain object
   * initial: { title: "New Document", count: 0 }
   *
   * @example
   * // Function returning Effect
   * initial: ({ documentId }) => Effect.succeed({ title: `Doc ${documentId}`, count: 0 })
   *
   * @default undefined (documents start empty or use schema defaults)
   */
  readonly initial?: Primitive.InferSetInput<TSchema> | InitialFn<TSchema>;
}

/**
 * Check if a value is an InitialFn (function) rather than a plain object.
 */
const isInitialFn = <TSchema extends Primitive.AnyPrimitive>(
  value: Primitive.InferSetInput<TSchema> | InitialFn<TSchema> | undefined
): value is InitialFn<TSchema> => typeof value === "function";

/**
 * Create a MimicServerConfig from options.
 */
export const make = <TSchema extends Primitive.AnyPrimitive>(
  options: MimicServerConfigOptions<TSchema>
): MimicServerConfig<TSchema> => {
  const { initial, schema } = options;

  // Convert initial to a function that applies defaults
  const initialFn: InitialFn<TSchema> | undefined = initial === undefined
    ? undefined
    : isInitialFn<TSchema>(initial)
      ? (context) => Effect.map(
          initial(context),
          (state) => Primitive.applyDefaults(schema, state as Partial<Primitive.InferState<TSchema>>)
        ) as Effect.Effect<Primitive.InferSetInput<TSchema>>
      : () => Effect.succeed(
          Primitive.applyDefaults(schema, initial as Partial<Primitive.InferState<TSchema>>)
        ) as Effect.Effect<Primitive.InferSetInput<TSchema>>;

  return {
    schema,
    maxIdleTime: Duration.decode(options.maxIdleTime ?? "5 minutes"),
    maxTransactionHistory: options.maxTransactionHistory ?? 1000,
    heartbeatInterval: Duration.decode(options.heartbeatInterval ?? "30 seconds"),
    heartbeatTimeout: Duration.decode(options.heartbeatTimeout ?? "10 seconds"),
    presence: options.presence,
    initial: initialFn,
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
export const layer = <TSchema extends Primitive.AnyPrimitive>(
  options: MimicServerConfigOptions<TSchema>
): Layer.Layer<MimicServerConfigTag> =>
  Layer.succeed(MimicServerConfigTag, make(options) as unknown as MimicServerConfig);
