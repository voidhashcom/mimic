import { StateDriftError } from "./errors";

// =============================================================================
// State Monitor Types
// =============================================================================

/**
 * Events emitted by the state monitor.
 */
export type StateMonitorEvent =
  | { type: "drift_detected"; expectedVersion: number; receivedVersion: number }
  | { type: "recovery_started" }
  | { type: "recovery_completed"; version: number }
  | { type: "recovery_failed"; error: Error }
  | { type: "pending_timeout"; transactionId: string; elapsedMs: number }
  | { type: "health_check"; pendingCount: number; oldestPendingMs: number | null };

/**
 * Handler for state monitor events.
 */
export type StateMonitorEventHandler = (event: StateMonitorEvent) => void;

/**
 * Options for creating a StateMonitor.
 */
export interface StateMonitorOptions {
  /** Handler for monitor events */
  readonly onEvent?: StateMonitorEventHandler;
  /** Interval for health checks in ms (default: 5000) */
  readonly healthCheckInterval?: number;
  /** Threshold for considering a pending transaction "stale" in ms (default: 10000) */
  readonly stalePendingThreshold?: number;
  /** Maximum allowed version gap before triggering recovery (default: 10) */
  readonly maxVersionGap?: number;
}

/**
 * Pending transaction info for monitoring.
 */
export interface PendingInfo {
  readonly id: string;
  readonly sentAt: number;
}

/**
 * A StateMonitor watches for state drift and triggers recovery.
 */
export interface StateMonitor {
  /**
   * Called when a server transaction is received.
   * Returns true if the version is valid, false if drift is detected.
   */
  readonly onServerVersion: (version: number) => boolean;

  /**
   * Called when a pending transaction is added.
   */
  readonly trackPending: (info: PendingInfo) => void;

  /**
   * Called when a pending transaction is confirmed or rejected.
   */
  readonly untrackPending: (id: string) => void;

  /**
   * Returns pending transactions that have exceeded the stale threshold.
   */
  readonly getStalePending: () => PendingInfo[];

  /**
   * Returns current monitoring status.
   */
  readonly getStatus: () => StateMonitorStatus;

  /**
   * Starts the health check loop.
   */
  readonly start: () => void;

  /**
   * Stops the health check loop.
   */
  readonly stop: () => void;

  /**
   * Resets the monitor state (called after recovery).
   */
  readonly reset: (newVersion: number) => void;
}

/**
 * Current monitoring status.
 */
export interface StateMonitorStatus {
  readonly expectedVersion: number;
  readonly pendingCount: number;
  readonly oldestPendingMs: number | null;
  readonly isHealthy: boolean;
  readonly isRecovering: boolean;
}

// =============================================================================
// State Monitor Implementation
// =============================================================================

/**
 * Creates a new StateMonitor.
 */
export const make = (options: StateMonitorOptions = {}): StateMonitor => {
  const {
    onEvent,
    healthCheckInterval = 5000,
    stalePendingThreshold = 10000,
    maxVersionGap = 10,
  } = options;

  // Internal state
  let _expectedVersion = 0;
  let _pendingMap = new Map<string, PendingInfo>();
  let _isRecovering = false;
  let _healthCheckHandle: ReturnType<typeof setInterval> | null = null;

  /**
   * Emits an event if handler is provided.
   */
  const emit = (event: StateMonitorEvent): void => {
    onEvent?.(event);
  };

  /**
   * Checks if there's a version gap indicating drift.
   */
  const checkVersionGap = (receivedVersion: number): boolean => {
    // Expected next version is current + 1
    const expectedNext = _expectedVersion + 1;

    if (receivedVersion < expectedNext) {
      // Duplicate or out-of-order - might be OK
      return true;
    }

    if (receivedVersion > expectedNext + maxVersionGap) {
      // Large gap - drift detected
      emit({
        type: "drift_detected",
        expectedVersion: expectedNext,
        receivedVersion,
      });
      return false;
    }

    // Small gap - could be network reordering, allow it
    return true;
  };

  /**
   * Runs a health check.
   */
  const runHealthCheck = (): void => {
    const now = Date.now();
    let oldestPendingMs: number | null = null;

    // Find stale pending transactions
    for (const [id, info] of _pendingMap) {
      const elapsed = now - info.sentAt;

      if (oldestPendingMs === null || elapsed > oldestPendingMs) {
        oldestPendingMs = elapsed;
      }

      if (elapsed > stalePendingThreshold) {
        emit({
          type: "pending_timeout",
          transactionId: id,
          elapsedMs: elapsed,
        });
      }
    }

    emit({
      type: "health_check",
      pendingCount: _pendingMap.size,
      oldestPendingMs,
    });
  };

  const monitor: StateMonitor = {
    onServerVersion: (version: number): boolean => {
      const isValid = checkVersionGap(version);

      if (isValid) {
        // Update expected version
        _expectedVersion = Math.max(_expectedVersion, version);
      }

      return isValid;
    },

    trackPending: (info: PendingInfo): void => {
      _pendingMap.set(info.id, info);
    },

    untrackPending: (id: string): void => {
      _pendingMap.delete(id);
    },

    getStalePending: (): PendingInfo[] => {
      const now = Date.now();
      const stale: PendingInfo[] = [];

      for (const info of _pendingMap.values()) {
        if (now - info.sentAt > stalePendingThreshold) {
          stale.push(info);
        }
      }

      return stale;
    },

    getStatus: (): StateMonitorStatus => {
      const now = Date.now();
      let oldestPendingMs: number | null = null;

      for (const info of _pendingMap.values()) {
        const elapsed = now - info.sentAt;
        if (oldestPendingMs === null || elapsed > oldestPendingMs) {
          oldestPendingMs = elapsed;
        }
      }

      // Consider unhealthy if recovering or has very stale pending
      const isHealthy =
        !_isRecovering &&
        (oldestPendingMs === null || oldestPendingMs < stalePendingThreshold * 2);

      return {
        expectedVersion: _expectedVersion,
        pendingCount: _pendingMap.size,
        oldestPendingMs,
        isHealthy,
        isRecovering: _isRecovering,
      };
    },

    start: (): void => {
      if (_healthCheckHandle !== null) return;

      _healthCheckHandle = setInterval(runHealthCheck, healthCheckInterval);
    },

    stop: (): void => {
      if (_healthCheckHandle !== null) {
        clearInterval(_healthCheckHandle);
        _healthCheckHandle = null;
      }
    },

    reset: (newVersion: number): void => {
      _expectedVersion = newVersion;
      _pendingMap.clear();
      _isRecovering = false;

      emit({
        type: "recovery_completed",
        version: newVersion,
      });
    },
  };

  return monitor;
};

// =============================================================================
// Recovery Strategy
// =============================================================================

/**
 * Recovery actions that can be taken.
 */
export type RecoveryAction =
  | { type: "request_snapshot" }
  | { type: "retry_pending"; transactionIds: string[] }
  | { type: "drop_pending"; transactionIds: string[] };

/**
 * Determines the appropriate recovery action based on current state.
 */
export const determineRecoveryAction = (
  status: StateMonitorStatus,
  stalePending: PendingInfo[]
): RecoveryAction => {
  // If recovering or unhealthy with stale pending, request full snapshot
  if (!status.isHealthy || stalePending.length > 3) {
    return { type: "request_snapshot" };
  }

  // If just a few stale pending, drop them
  if (stalePending.length > 0) {
    return {
      type: "drop_pending",
      transactionIds: stalePending.map((p) => p.id),
    };
  }

  // Default: request snapshot for safety
  return { type: "request_snapshot" };
};
