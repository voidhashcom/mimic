/**
 * @voidhash/mimic-effect - Metrics
 *
 * Observability metrics using Effect's Metric API.
 */
import { Metric, MetricBoundaries } from "effect";

// =============================================================================
// Connection Metrics
// =============================================================================

/**
 * Current active WebSocket connections
 */
export const connectionsActive = Metric.gauge("mimic.connections.active");

/**
 * Total connections over lifetime
 */
export const connectionsTotal = Metric.counter("mimic.connections.total");

/**
 * Connection duration histogram (milliseconds)
 */
export const connectionsDuration = Metric.histogram(
  "mimic.connections.duration_ms",
  MetricBoundaries.exponential({
    start: 100,
    factor: 2,
    count: 15, // Up to ~3.2 million ms (~53 minutes)
  })
);

/**
 * Connection errors (auth failures, etc.)
 */
export const connectionsErrors = Metric.counter("mimic.connections.errors");

// =============================================================================
// Document Metrics
// =============================================================================

/**
 * Documents currently in memory
 */
export const documentsActive = Metric.gauge("mimic.documents.active");

/**
 * New documents created
 */
export const documentsCreated = Metric.counter("mimic.documents.created");

/**
 * Documents restored from storage
 */
export const documentsRestored = Metric.counter("mimic.documents.restored");

/**
 * Documents garbage collected (evicted)
 */
export const documentsEvicted = Metric.counter("mimic.documents.evicted");

// =============================================================================
// Transaction Metrics
// =============================================================================

/**
 * Successfully processed transactions
 */
export const transactionsProcessed = Metric.counter(
  "mimic.transactions.processed"
);

/**
 * Rejected transactions
 */
export const transactionsRejected = Metric.counter(
  "mimic.transactions.rejected"
);

/**
 * Transaction processing latency histogram (milliseconds)
 */
export const transactionsLatency = Metric.histogram(
  "mimic.transactions.latency_ms",
  MetricBoundaries.exponential({
    start: 0.1,
    factor: 2,
    count: 15, // Up to ~1638 ms
  })
);

// =============================================================================
// Storage Metrics
// =============================================================================

/**
 * Snapshots saved to ColdStorage
 */
export const storageSnapshots = Metric.counter("mimic.storage.snapshots");

/**
 * Snapshot save duration histogram (milliseconds)
 */
export const storageSnapshotLatency = Metric.histogram(
  "mimic.storage.snapshot_latency_ms",
  MetricBoundaries.exponential({
    start: 1,
    factor: 2,
    count: 12, // Up to ~4 seconds
  })
);

/**
 * WAL entries written to HotStorage
 */
export const storageWalAppends = Metric.counter("mimic.storage.wal_appends");

/**
 * Version gaps detected during WAL replay
 */
export const storageVersionGaps = Metric.counter("mimic.storage.version_gaps");

/**
 * Failed WAL appends causing transaction rollback
 */
export const walAppendFailures = Metric.counter("mimic.storage.wal_append_failures");

/**
 * ColdStorage load failures during document restore
 */
export const coldStorageLoadFailures = Metric.counter("mimic.storage.cold_load_failures");

/**
 * HotStorage getEntries failures during document restore
 */
export const hotStorageLoadFailures = Metric.counter("mimic.storage.hot_load_failures");

// =============================================================================
// Presence Metrics
// =============================================================================

/**
 * Presence set operations
 */
export const presenceUpdates = Metric.counter("mimic.presence.updates");

/**
 * Active presence entries
 */
export const presenceActive = Metric.gauge("mimic.presence.active");

// =============================================================================
// Export namespace
// =============================================================================

export const MimicMetrics = {
  // Connection
  connectionsActive,
  connectionsTotal,
  connectionsDuration,
  connectionsErrors,

  // Document
  documentsActive,
  documentsCreated,
  documentsRestored,
  documentsEvicted,

  // Transaction
  transactionsProcessed,
  transactionsRejected,
  transactionsLatency,

  // Storage
  storageSnapshots,
  storageSnapshotLatency,
  storageWalAppends,
  storageVersionGaps,
  walAppendFailures,
  coldStorageLoadFailures,
  hotStorageLoadFailures,

  // Presence
  presenceUpdates,
  presenceActive,
};
