/**
 * @voidhash/mimic-effect - MimicServerEngine
 *
 * Core document management service for Mimic real-time collaboration.
 * Handles document lifecycle, storage, presence, and transaction processing.
 *
 * This is the engine layer - for WebSocket routes, use MimicServer.layerHttpLayerRouter().
 */
import {
  Context,
  Duration,
  Effect,
  Layer,
  Scope,
  Stream,
} from "effect";
import type { Presence, Primitive, Transaction } from "@voidhash/mimic";
import type {
  MimicServerEngineConfig,
  PresenceEntry,
  PresenceEvent,
  PresenceSnapshot,
  ResolvedConfig,
} from "./Types.js";
import type * as Protocol from "./Protocol.js";
import { ColdStorageTag } from "./ColdStorage.js";
import { HotStorageTag } from "./HotStorage.js";
import { MimicAuthServiceTag } from "./MimicAuthService.js";
import {
  DocumentManagerTag,
  DocumentManagerConfigTag,
  layer as documentManagerLayer,
  type SubmitResult,
} from "./DocumentManager.js";
import {
  PresenceManagerTag,
  layer as presenceManagerLayer,
} from "./PresenceManager.js";

// =============================================================================
// MimicServerEngine Interface
// =============================================================================

/**
 * MimicServerEngine service interface.
 *
 * Provides document management operations for Mimic collaboration.
 * Use MimicServer.layerHttpLayerRouter() to create WebSocket routes.
 */
export interface MimicServerEngine {
  /**
   * Submit a transaction to a document.
   * Authorization is checked against the auth service.
   */
  readonly submit: (
    documentId: string,
    transaction: Transaction.Transaction
  ) => Effect.Effect<SubmitResult, never>;

  /**
   * Get document snapshot (current state and version).
   */
  readonly getSnapshot: (
    documentId: string
  ) => Effect.Effect<{ state: unknown; version: number }, never>;

  /**
   * Subscribe to document broadcasts (transactions).
   * Returns a stream of server messages.
   * Requires a Scope for cleanup when the subscription ends.
   */
  readonly subscribe: (
    documentId: string
  ) => Effect.Effect<Stream.Stream<Protocol.ServerMessage, never, never>, never, Scope.Scope>;

  /**
   * Touch document to prevent idle garbage collection.
   */
  readonly touch: (documentId: string) => Effect.Effect<void, never>;

  /**
   * Get presence snapshot for a document.
   */
  readonly getPresenceSnapshot: (
    documentId: string
  ) => Effect.Effect<PresenceSnapshot, never>;

  /**
   * Set presence for a connection.
   */
  readonly setPresence: (
    documentId: string,
    connectionId: string,
    entry: PresenceEntry
  ) => Effect.Effect<void, never>;

  /**
   * Remove presence for a connection.
   */
  readonly removePresence: (
    documentId: string,
    connectionId: string
  ) => Effect.Effect<void, never>;

  /**
   * Subscribe to presence events for a document.
   * Requires a Scope for cleanup when the subscription ends.
   */
  readonly subscribePresence: (
    documentId: string
  ) => Effect.Effect<Stream.Stream<PresenceEvent, never, never>, never, Scope.Scope>;

  /**
   * Resolved engine configuration.
   * Used by route layer to access schema, presence config, etc.
   */
  readonly config: ResolvedConfig<Primitive.AnyPrimitive>;
}

// =============================================================================
// Context Tag
// =============================================================================

/**
 * Context tag for MimicServerEngine
 */
export class MimicServerEngineTag extends Context.Tag(
  "@voidhash/mimic-effect/MimicServerEngine"
)<MimicServerEngineTag, MimicServerEngine>() {}

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_MAX_IDLE_TIME = Duration.minutes(5);
const DEFAULT_MAX_TRANSACTION_HISTORY = 1000;
const DEFAULT_SNAPSHOT_INTERVAL = Duration.minutes(5);
const DEFAULT_SNAPSHOT_THRESHOLD = 100;

/**
 * Resolve configuration with defaults
 */
const resolveConfig = <TSchema extends Primitive.AnyPrimitive>(
  config: MimicServerEngineConfig<TSchema>
): ResolvedConfig<TSchema> => ({
  schema: config.schema,
  initial: config.initial,
  presence: config.presence,
  maxIdleTime: config.maxIdleTime
    ? Duration.decode(config.maxIdleTime)
    : DEFAULT_MAX_IDLE_TIME,
  maxTransactionHistory:
    config.maxTransactionHistory ?? DEFAULT_MAX_TRANSACTION_HISTORY,
  snapshot: {
    interval: config.snapshot?.interval
      ? Duration.decode(config.snapshot.interval)
      : DEFAULT_SNAPSHOT_INTERVAL,
    transactionThreshold:
      config.snapshot?.transactionThreshold ?? DEFAULT_SNAPSHOT_THRESHOLD,
  },
});

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a MimicServerEngine layer.
 *
 * This creates the core document management service. To expose it via WebSocket,
 * use MimicServer.layerHttpLayerRouter().
 *
 * @example
 * ```typescript
 * // 1. Create the engine
 * const Engine = MimicServerEngine.make({
 *   schema: DocSchema,
 *   initial: { title: "Untitled" },
 *   presence: CursorPresence,
 *   maxIdleTime: "5 minutes",
 *   snapshot: { interval: "5 minutes", transactionThreshold: 100 },
 * })
 *
 * // 2. Create the WebSocket route
 * const MimicRoute = MimicServer.layerHttpLayerRouter({
 *   path: "/mimic",
 * })
 *
 * // 3. Wire together
 * const MimicLive = MimicRoute.pipe(
 *   Layer.provide(Engine),
 *   Layer.provide(ColdStorage.InMemory.make()),
 *   Layer.provide(HotStorage.InMemory.make()),
 *   Layer.provide(MimicAuthService.NoAuth.make()),
 * )
 * ```
 */
export const make = <TSchema extends Primitive.AnyPrimitive>(
  config: MimicServerEngineConfig<TSchema>
): Layer.Layer<
  MimicServerEngineTag,
  never,
  ColdStorageTag | HotStorageTag | MimicAuthServiceTag
> => {
  const resolvedConfig = resolveConfig(config);

  // Create config layer for DocumentManager
  const configLayer = Layer.succeed(
    DocumentManagerConfigTag,
    resolvedConfig as ResolvedConfig<Primitive.AnyPrimitive>
  );

  // Create internal layers
  const internalLayers = Layer.mergeAll(
    documentManagerLayer.pipe(Layer.provide(configLayer)),
    presenceManagerLayer
  );

  return Layer.scoped(
    MimicServerEngineTag,
    Effect.gen(function* () {
      const documentManager = yield* DocumentManagerTag;
      const presenceManager = yield* PresenceManagerTag;

      const engine: MimicServerEngine = {
        submit: (documentId, transaction) =>
          documentManager.submit(documentId, transaction),

        getSnapshot: (documentId) => documentManager.getSnapshot(documentId),

        subscribe: (documentId) =>
          documentManager.subscribe(documentId) as Effect.Effect<
            Stream.Stream<Protocol.ServerMessage, never, never>,
            never
          >,

        touch: (documentId) => documentManager.touch(documentId),

        getPresenceSnapshot: (documentId) =>
          presenceManager.getSnapshot(documentId),

        setPresence: (documentId, connectionId, entry) =>
          presenceManager.set(documentId, connectionId, entry),

        removePresence: (documentId, connectionId) =>
          presenceManager.remove(documentId, connectionId),

        subscribePresence: (documentId) =>
          presenceManager.subscribe(documentId),

        config: resolvedConfig as ResolvedConfig<Primitive.AnyPrimitive>,
      };

      return engine;
    })
  ).pipe(Layer.provide(internalLayers));
};

// =============================================================================
// Re-export namespace
// =============================================================================

export const MimicServerEngine = {
  Tag: MimicServerEngineTag,
  make,
};

// =============================================================================
// Re-export SubmitResult type
// =============================================================================

export type { SubmitResult };
