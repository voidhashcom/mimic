/**
 * @voidhash/mimic-effect - DocumentInstance
 *
 * Manages the lifecycle of a single document including:
 * - Restoration from storage (cold storage + WAL replay)
 * - Transaction submission with WAL persistence
 * - Snapshot saving and trigger checking
 *
 * Used by both MimicServerEngine (single-node) and MimicClusterServerEngine (clustered).
 */
import { Duration, Effect, Metric, PubSub, Ref } from "effect";
import { Document, type Primitive, type Transaction } from "@voidhash/mimic";
import { ServerDocument } from "@voidhash/mimic/server";
import type { StoredDocument, WalEntry } from "./Types";
import type { ServerBroadcast } from "./Protocol";
import type { ColdStorage } from "./ColdStorage";
import type { HotStorage } from "./HotStorage";
import type { ColdStorageError } from "./Errors";
import type { HotStorageError } from "./Errors";
import * as Metrics from "./Metrics";

// =============================================================================
// Types
// =============================================================================

/**
 * Result of submitting a transaction
 */
export type SubmitResult =
  | { readonly success: true; readonly version: number }
  | { readonly success: false; readonly reason: string };

/**
 * Configuration for a DocumentInstance
 */
export interface DocumentInstanceConfig<TSchema extends Primitive.AnyPrimitive> {
  readonly schema: TSchema;
  readonly initial?:
    | Primitive.InferSetInput<TSchema>
    | ((ctx: { documentId: string }) => Effect.Effect<Primitive.InferSetInput<TSchema>>);
  readonly maxTransactionHistory: number;
  readonly snapshot: {
    readonly interval: Duration.Duration;
    readonly transactionThreshold: number;
  };
}

/**
 * Snapshot tracking state
 */
export interface SnapshotTracking {
  readonly lastSnapshotVersion: number;
  readonly lastSnapshotTime: number;
  readonly transactionsSinceSnapshot: number;
}

/**
 * A DocumentInstance manages a single document's lifecycle
 */
export interface DocumentInstance<TSchema extends Primitive.AnyPrimitive> {
  /** The underlying ServerDocument */
  readonly document: ServerDocument.ServerDocument<TSchema>;
  /** PubSub for broadcasting messages to subscribers */
  readonly pubsub: PubSub.PubSub<ServerBroadcast>;
  /** Current snapshot tracking state */
  readonly getSnapshotTracking: Effect.Effect<SnapshotTracking>;
  /** Submit a transaction */
  readonly submit: (transaction: Transaction.Transaction) => Effect.Effect<SubmitResult, ColdStorageError | HotStorageError>;
  /** Save a snapshot to cold storage */
  readonly saveSnapshot: () => Effect.Effect<void, ColdStorageError | HotStorageError>;
  /** Check if snapshot should be triggered and save if needed */
  readonly checkSnapshotTriggers: () => Effect.Effect<void, ColdStorageError | HotStorageError>;
  /** Update last activity time (for external tracking) */
  readonly touch: () => Effect.Effect<void>;
  /** Get current document version */
  readonly getVersion: () => number;
  /** Get document snapshot */
  readonly getSnapshot: () => { state: unknown; version: number };
}

// =============================================================================
// Factory
// =============================================================================

/**
 * Create a DocumentInstance for a single document.
 *
 * This handles:
 * - Loading from cold storage or computing initial state
 * - Persisting initial state immediately (crash safety)
 * - Replaying WAL entries
 * - Transaction submission with WAL persistence
 * - Snapshot saving
 */
export const make = <TSchema extends Primitive.AnyPrimitive>(
  documentId: string,
  config: DocumentInstanceConfig<TSchema>,
  coldStorage: ColdStorage,
  hotStorage: HotStorage
): Effect.Effect<DocumentInstance<TSchema>, ColdStorageError | HotStorageError> =>
  Effect.gen(function* () {
    // Current schema version (hard-coded to 1 for now)
    const SCHEMA_VERSION = 1;

    // 1. Load snapshot from ColdStorage
    const storedDoc = yield* coldStorage.load(documentId);

    // Track initial values - only one will be set:
    // - initialState: raw state from storage (already in internal format)
    // - initial: computed from config (needs conversion to state format)
    let initialState: Primitive.InferState<TSchema> | undefined;
    let initial: Primitive.InferSetInput<TSchema> | undefined;
    let initialVersion = 0;

    if (storedDoc) {
      // Loading from storage - state is already in internal format
      initialState = storedDoc.state as Primitive.InferState<TSchema>;
      initialVersion = storedDoc.version;
    } else {
      // New document - compute initial value (set input format)
      initial = yield* computeInitialState(config, documentId);
    }

    // 2. Create PubSub for broadcasting
    const pubsub = yield* PubSub.unbounded<ServerBroadcast>();

    // 3. Create refs for tracking
    const lastSnapshotVersionRef = yield* Ref.make(initialVersion);
    const lastSnapshotTimeRef = yield* Ref.make(Date.now());
    const transactionsSinceSnapshotRef = yield* Ref.make(0);
    const lastActivityTimeRef = yield* Ref.make(Date.now());

    // 4. Create ServerDocument with callbacks
    const document = ServerDocument.make({
      schema: config.schema,
      initial,
      initialState,
      initialVersion,
      maxTransactionHistory: config.maxTransactionHistory,
      onBroadcast: (message: ServerDocument.TransactionMessage) => {
        Effect.runSync(
          PubSub.publish(pubsub, {
            type: "transaction",
            transaction: message.transaction,
            version: message.version,
          })
        );
      },
      onRejection: (transactionId: string, reason: string) => {
        Effect.runSync(
          PubSub.publish(pubsub, {
            type: "error",
            transactionId,
            reason,
          })
        );
      },
    });

    // 5. If this is a new document, immediately save to cold storage
    // This ensures the initial state is durable before any transactions are accepted.
    if (!storedDoc) {
      const initialStoredDoc = createStoredDocument(document.get(), 0, SCHEMA_VERSION);
      yield* coldStorage.save(documentId, initialStoredDoc);
      yield* Effect.logDebug("Initial state persisted to cold storage", { documentId });
    }

    // 6. Load WAL entries
    const walEntries = yield* hotStorage.getEntries(documentId, initialVersion);

    // 7. Verify WAL continuity (warning only, non-blocking)
    yield* verifyWalContinuity(documentId, walEntries, initialVersion);

    // 8. Replay WAL entries
    yield* replayWalEntries(documentId, document, walEntries);

    // Track metrics
    if (storedDoc) {
      yield* Metric.increment(Metrics.documentsRestored);
    } else {
      yield* Metric.increment(Metrics.documentsCreated);
    }
    yield* Metric.incrementBy(Metrics.documentsActive, 1);

    // ==========================================================================
    // Instance Methods
    // ==========================================================================

    const getSnapshotTracking = Effect.gen(function* () {
      return {
        lastSnapshotVersion: yield* Ref.get(lastSnapshotVersionRef),
        lastSnapshotTime: yield* Ref.get(lastSnapshotTimeRef),
        transactionsSinceSnapshot: yield* Ref.get(transactionsSinceSnapshotRef),
      };
    });

    const saveSnapshot = Effect.fn("document.snapshot.save")(function* () {
      const targetVersion = document.getVersion();
      const lastSnapshotVersion = yield* Ref.get(lastSnapshotVersionRef);

      // Idempotency check: skip if already snapshotted at this version
      if (targetVersion <= lastSnapshotVersion) {
        return;
      }

      const snapshotStartTime = Date.now();

      // Load base snapshot from cold storage
      const baseSnapshot = yield* coldStorage.load(documentId);
      const baseVersion = baseSnapshot?.version ?? 0;
      const baseState = baseSnapshot?.state as Primitive.InferState<TSchema> | undefined;

      // Load WAL entries from base to target
      const walEntries = yield* hotStorage.getEntries(documentId, baseVersion);

      // Compute snapshot state by replaying WAL on base
      const snapshotResult = computeSnapshotState(
        config.schema,
        baseState,
        walEntries,
        targetVersion
      );

      if (!snapshotResult) {
        return;
      }

      // Re-check before saving (in case another snapshot completed while we were working)
      const currentLastSnapshot = yield* Ref.get(lastSnapshotVersionRef);
      if (snapshotResult.version <= currentLastSnapshot) {
        return;
      }

      const storedDoc = createStoredDocument(
        snapshotResult.state,
        snapshotResult.version,
        SCHEMA_VERSION
      );

      // Save to ColdStorage
      yield* coldStorage.save(documentId, storedDoc);

      // Track snapshot metrics
      const snapshotDuration = Date.now() - snapshotStartTime;
      yield* Metric.increment(Metrics.storageSnapshots);
      yield* Metric.update(Metrics.storageSnapshotLatency, snapshotDuration);

      // Update tracking BEFORE truncate (for idempotency on retry)
      yield* Ref.set(lastSnapshotVersionRef, snapshotResult.version);
      yield* Ref.set(lastSnapshotTimeRef, Date.now());
      yield* Ref.set(transactionsSinceSnapshotRef, 0);

      // Truncate WAL - non-fatal, will be retried on next snapshot
      yield* Effect.catchAll(hotStorage.truncate(documentId, snapshotResult.version), (e) =>
        Effect.logWarning("WAL truncate failed - will retry on next snapshot", {
          documentId,
          version: snapshotResult.version,
          error: e,
        })
      );
    });

    const checkSnapshotTriggers = Effect.fn("document.snapshot.check-triggers")(function* () {
      const txCount = yield* Ref.get(transactionsSinceSnapshotRef);
      const lastTime = yield* Ref.get(lastSnapshotTimeRef);

      if (shouldTriggerSnapshot(txCount, lastTime, config.snapshot)) {
        yield* saveSnapshot();
      }
    });

    const submit = Effect.fn("document.transaction.submit")(function* (
      transaction: Transaction.Transaction
    ) {
      const submitStartTime = Date.now();

      // Update activity time
      yield* Ref.set(lastActivityTimeRef, Date.now());

      // Phase 1: Validate (no side effects)
      const validation = document.validate(transaction);

      if (!validation.valid) {
        yield* Metric.increment(Metrics.transactionsRejected);
        const latency = Date.now() - submitStartTime;
        yield* Metric.update(Metrics.transactionsLatency, latency);

        return {
          success: false as const,
          reason: validation.reason,
        };
      }

      // Phase 2: Append to WAL with gap check (BEFORE state mutation)
      const walEntry: WalEntry = {
        transaction,
        version: validation.nextVersion,
        timestamp: Date.now(),
      };

      const appendResult = yield* Effect.either(
        hotStorage.appendWithCheck(documentId, walEntry, validation.nextVersion)
      );

      if (appendResult._tag === "Left") {
        yield* Effect.logError("WAL append failed", {
          documentId,
          version: validation.nextVersion,
          error: appendResult.left,
        });
        yield* Metric.increment(Metrics.walAppendFailures);

        const latency = Date.now() - submitStartTime;
        yield* Metric.update(Metrics.transactionsLatency, latency);

        return {
          success: false as const,
          reason: "Storage unavailable. Please retry.",
        };
      }

      // Phase 3: Apply (state mutation + broadcast)
      document.apply(transaction);

      // Track metrics
      const latency = Date.now() - submitStartTime;
      yield* Metric.update(Metrics.transactionsLatency, latency);
      yield* Metric.increment(Metrics.transactionsProcessed);
      yield* Metric.increment(Metrics.storageWalAppends);

      // Increment transaction count
      yield* Ref.update(transactionsSinceSnapshotRef, (n) => n + 1);

      // Check snapshot triggers
      yield* checkSnapshotTriggers();

      return {
        success: true as const,
        version: validation.nextVersion,
      };
    });

    const touch = Effect.fn("document.touch")(function* () {
      yield* Ref.set(lastActivityTimeRef, Date.now());
    });

    return {
      document,
      pubsub,
      getSnapshotTracking,
      submit,
      saveSnapshot,
      checkSnapshotTriggers,
      touch,
      getVersion: () => document.getVersion(),
      getSnapshot: () => document.getSnapshot(),
    };
  });

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Compute initial state for a new document.
 */
const computeInitialState = <TSchema extends Primitive.AnyPrimitive>(
  config: DocumentInstanceConfig<TSchema>,
  documentId: string
): Effect.Effect<Primitive.InferSetInput<TSchema> | undefined> => {
  if (config.initial === undefined) {
    return Effect.succeed(undefined);
  }

  if (typeof config.initial === "function") {
    return (config.initial as (ctx: { documentId: string }) => Effect.Effect<Primitive.InferSetInput<TSchema>>)({
      documentId,
    });
  }

  return Effect.succeed(config.initial as Primitive.InferSetInput<TSchema>);
};

/**
 * Verify WAL continuity and log warnings for any gaps.
 */
const verifyWalContinuity = Effect.fn("document.wal.verify")(function* (
  documentId: string,
  walEntries: readonly WalEntry[],
  baseVersion: number
) {
  if (walEntries.length === 0) {
    return;
  }

  const firstWalVersion = walEntries[0]!.version;
  const expectedFirst = baseVersion + 1;

  if (firstWalVersion !== expectedFirst) {
    yield* Effect.logWarning("WAL version gap detected", {
      documentId,
      snapshotVersion: baseVersion,
      firstWalVersion,
      expectedFirst,
    });
    yield* Metric.increment(Metrics.storageVersionGaps);
  }

  for (let i = 1; i < walEntries.length; i++) {
    const prev = walEntries[i - 1]!.version;
    const curr = walEntries[i]!.version;
    if (curr !== prev + 1) {
      yield* Effect.logWarning("WAL internal gap detected", {
        documentId,
        previousVersion: prev,
        currentVersion: curr,
      });
    }
  }
});

/**
 * Replay WAL entries onto a ServerDocument.
 */
const replayWalEntries = Effect.fn("document.wal.replay")(function* (
  documentId: string,
  document: ServerDocument.ServerDocument<Primitive.AnyPrimitive>,
  walEntries: readonly WalEntry[]
) {
  for (const entry of walEntries) {
    const result = document.submit(entry.transaction);
    if (!result.success) {
      yield* Effect.logWarning("Skipping corrupted WAL entry", {
        documentId,
        version: entry.version,
        reason: result.reason,
      });
    }
  }
});

/**
 * Compute snapshot state by replaying WAL entries on a base state.
 */
const computeSnapshotState = <TSchema extends Primitive.AnyPrimitive>(
  schema: TSchema,
  baseState: Primitive.InferState<TSchema> | undefined,
  walEntries: readonly WalEntry[],
  targetVersion: number
): { state: Primitive.InferState<TSchema>; version: number } | undefined => {
  const relevantEntries = walEntries.filter((e) => e.version <= targetVersion);

  if (relevantEntries.length === 0 && baseState === undefined) {
    return undefined;
  }

  let snapshotState: Primitive.InferState<TSchema> | undefined = baseState;
  for (const entry of relevantEntries) {
    const tempDoc = Document.make(schema, { initialState: snapshotState });
    tempDoc.apply(entry.transaction.ops);
    snapshotState = tempDoc.get();
  }

  if (snapshotState === undefined) {
    return undefined;
  }

  const snapshotVersion =
    relevantEntries.length > 0 ? relevantEntries[relevantEntries.length - 1]!.version : 0;

  return { state: snapshotState, version: snapshotVersion };
};

/**
 * Check if a snapshot should be triggered.
 */
const shouldTriggerSnapshot = (
  transactionsSinceSnapshot: number,
  lastSnapshotTime: number,
  config: { interval: Duration.Duration; transactionThreshold: number }
): boolean => {
  const now = Date.now();
  const intervalMs = Duration.toMillis(config.interval);

  if (transactionsSinceSnapshot >= config.transactionThreshold) {
    return true;
  }

  if (now - lastSnapshotTime >= intervalMs) {
    return true;
  }

  return false;
};

/**
 * Create a StoredDocument for persistence.
 */
const createStoredDocument = (
  state: unknown,
  version: number,
  schemaVersion: number
): StoredDocument => ({
  state,
  version,
  schemaVersion,
  savedAt: Date.now(),
});

// =============================================================================
// Re-export namespace
// =============================================================================

export const DocumentInstance = {
  make,
};
