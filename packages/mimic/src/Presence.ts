/**
 * @since 0.0.1
 * Presence module for ephemeral per-connection state.
 * Used by both client and server for schema validation.
 */
import * as Schema from "effect/Schema";

// =============================================================================
// Presence Types
// =============================================================================

/**
 * A Presence schema wrapper that holds an Effect Schema for validation.
 * This is used by both client and server to validate presence data.
 */
export interface Presence<TData> {
  readonly _tag: "Presence";
  /** The Effect Schema used for validation */
  readonly schema: Schema.Schema<TData>;
  /** Branded type marker for inference */
  readonly _Data: TData;
}

/**
 * Options for creating a Presence instance.
 */
export interface PresenceOptions<TData> {
  /** The Effect Schema defining the presence data structure */
  readonly schema: Schema.Schema<TData>;
}

/**
 * Infer the data type from a Presence instance.
 */
export type Infer<P extends Presence<any>> = P["_Data"];

/**
 * Any Presence type (for generic constraints).
 */
export type AnyPresence = Presence<any>;

// =============================================================================
// Presence Entry (for storage/transport)
// =============================================================================

/**
 * A presence entry as stored/transmitted.
 */
export interface PresenceEntry<TData = unknown> {
  /** The presence data */
  readonly data: TData;
  /** Optional user ID from authentication */
  readonly userId?: string;
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Creates a new Presence schema wrapper.
 *
 * @example
 * ```typescript
 * import { Presence } from "@voidhash/mimic";
 * import { Schema } from "effect";
 *
 * const CursorPresence = Presence.make({
 *   schema: Schema.Struct({
 *     name: Schema.String,
 *     cursor: Schema.Struct({
 *       x: Schema.Number,
 *       y: Schema.Number,
 *     }),
 *   }),
 * });
 * ```
 */
export const make = <TData,>(options: PresenceOptions<TData>): Presence<TData> => ({
  _tag: "Presence",
  schema: options.schema,
  _Data: undefined as unknown as TData,
});

// =============================================================================
// Validation Functions
// =============================================================================

/**
 * Validates unknown data against a Presence schema.
 * Throws a ParseError if validation fails.
 *
 * @param presence - The Presence instance with the schema
 * @param data - Unknown data to validate
 * @returns The validated and typed data
 * @throws ParseError if validation fails
 */
export const validate = <TData,>(
  presence: Presence<TData>,
  data: unknown
): TData => {
  return Schema.decodeUnknownSync(presence.schema)(data);
};

/**
 * Safely validates unknown data against a Presence schema.
 * Returns undefined if validation fails instead of throwing.
 *
 * @param presence - The Presence instance with the schema
 * @param data - Unknown data to validate
 * @returns The validated data or undefined if invalid
 */
export const validateSafe = <TData,>(
  presence: Presence<TData>,
  data: unknown
): TData | undefined => {
  try {
    return Schema.decodeUnknownSync(presence.schema)(data);
  } catch {
    return undefined;
  }
};

/**
 * Checks if unknown data is valid according to a Presence schema.
 *
 * @param presence - The Presence instance with the schema
 * @param data - Unknown data to check
 * @returns true if valid, false otherwise
 */
export const isValid = <TData,>(
  presence: Presence<TData>,
  data: unknown
): data is TData => {
  try {
    Schema.decodeUnknownSync(presence.schema)(data);
    return true;
  } catch {
    return false;
  }
};

