import * as Document from "../Document";
import * as Transaction from "../Transaction";
import * as Presence from "../Presence";
import type * as Primitive from "../Primitive";
import type * as Transport from "./Transport";
import * as Rebase from "./Rebase";
import {
  TransactionRejectedError,
  NotConnectedError,
  InvalidStateError,
} from "./errors";

// =============================================================================
// Client Document Types
// =============================================================================

/**
 * Pending transaction with metadata for tracking.
 */
interface PendingTransaction {
  /** The transaction */
  readonly transaction: Transaction.Transaction;
  /** Original transaction before any rebasing */
  readonly original: Transaction.Transaction;
  /** Timestamp when the transaction was sent */
  readonly sentAt: number;
}

/**
 * Initialization state for the client document.
 * Handles the race condition during startup where transactions
 * may arrive while fetching the initial snapshot.
 */
type InitState =
  | { readonly type: "uninitialized" }
  | { readonly type: "initializing"; readonly bufferedMessages: Transport.ServerMessage[] }
  | { readonly type: "ready" };

// =============================================================================
// Presence Types
// =============================================================================

/**
 * Listener for presence changes.
 */
export interface PresenceListener<_TData> {
  /** Called when any presence changes (self or others) */
  readonly onPresenceChange?: () => void;
}

/**
 * Presence API exposed on the ClientDocument.
 */
export interface ClientPresence<TData> {
  /**
   * Returns this client's connection ID (set after receiving presence_snapshot).
   * Returns undefined before the snapshot is received.
   */
  readonly selfId: () => string | undefined;

  /**
   * Returns this client's current presence data.
   * Returns undefined if not set.
   */
  readonly self: () => TData | undefined;

  /**
   * Returns a map of other clients' presence data.
   * Keys are connection IDs.
   */
  readonly others: () => ReadonlyMap<string, Presence.PresenceEntry<TData>>;

  /**
   * Returns all presence entries including self.
   */
  readonly all: () => ReadonlyMap<string, Presence.PresenceEntry<TData>>;

  /**
   * Sets this client's presence data.
   * Validates against the presence schema before sending.
   * @throws ParseError if validation fails
   */
  readonly set: (data: TData) => void;

  /**
   * Clears this client's presence data.
   */
  readonly clear: () => void;

  /**
   * Subscribes to presence changes.
   * @returns Unsubscribe function
   */
  readonly subscribe: (listener: PresenceListener<TData>) => () => void;
}

/**
 * Options for creating a ClientDocument.
 */
export interface ClientDocumentOptions<
  TSchema extends Primitive.AnyPrimitive,
  TPresence extends Presence.AnyPresence | undefined = undefined
> {
  /** The schema defining the document structure */
  readonly schema: TSchema;
  /** Transport for server communication */
  readonly transport: Transport.Transport;
  /** Initial state (optional, will sync from server if not provided) */
  readonly initialState?: Primitive.InferState<TSchema>;
  /** Initial server version (optional) */
  readonly initialVersion?: number;
  /** Called when server rejects a transaction */
  readonly onRejection?: (
    transaction: Transaction.Transaction,
    reason: string
  ) => void;
  /** Called when optimistic state changes */
  readonly onStateChange?: (state: Primitive.InferState<TSchema> | undefined) => void;
  /** Called when connection status changes */
  readonly onConnectionChange?: (connected: boolean) => void;
  /** Called when client is fully initialized and ready */
  readonly onReady?: () => void;
  /** Timeout in ms for pending transactions (default: 30000) */
  readonly transactionTimeout?: number;
  /** Timeout in ms for initialization (default: 10000) */
  readonly initTimeout?: number;
  /** Enable debug logging for all activity (default: false) */
  readonly debug?: boolean;
  /**
   * Optional presence schema for ephemeral per-user data.
   * When provided, enables the presence API on the ClientDocument.
   */
  readonly presence?: TPresence;
  /** Initial presence data, that will be set on the ClientDocument when it is created */
  readonly initialPresence?: TPresence extends Presence.AnyPresence ? Presence.Infer<TPresence> : undefined;
}

/**
 * Listener callbacks for subscribing to ClientDocument events.
 */
export interface ClientDocumentListener<TSchema extends Primitive.AnyPrimitive> {
  /** Called when optimistic state changes */
  readonly onStateChange?: (state: Primitive.InferState<TSchema> | undefined) => void;
  /** Called when connection status changes */
  readonly onConnectionChange?: (connected: boolean) => void;
  /** Called when client is fully initialized and ready */
  readonly onReady?: () => void;
}

/**
 * A ClientDocument provides optimistic updates with server synchronization.
 */
export interface ClientDocument<
  TSchema extends Primitive.AnyPrimitive,
  TPresence extends Presence.AnyPresence | undefined = undefined
> {
  /** The schema defining this document's structure */
  readonly schema: TSchema;

  /** Root proxy for accessing and modifying document data (optimistic) */
  readonly root: Primitive.InferProxy<TSchema>;

  /** Returns the current optimistic state (server + pending) */
  get(): Primitive.InferState<TSchema> | undefined;

  /** Returns the confirmed server state */
  getServerState(): Primitive.InferState<TSchema> | undefined;

  /** Returns the current server version */
  getServerVersion(): number;

  /** Returns pending transactions count */
  getPendingCount(): number;

  /** Returns whether there are pending transactions */
  hasPendingChanges(): boolean;

  /**
   * Runs a function within a transaction.
   * Changes are applied optimistically and sent to the server.
   */
  transaction<R>(fn: (root: Primitive.InferProxy<TSchema>) => R): R;

  /**
   * Connects to the server and starts syncing.
   */
  connect(): Promise<void>;

  /**
   * Disconnects from the server.
   */
  disconnect(): void;

  /**
   * Returns whether currently connected to the server.
   */
  isConnected(): boolean;

  /**
   * Forces a full resync from the server.
   */
  resync(): void;

  /**
   * Returns whether the client is fully initialized and ready.
   */
  isReady(): boolean;

  /**
   * Subscribes to document events (state changes, connection changes, ready).
   * @returns Unsubscribe function
   */
  subscribe(listener: ClientDocumentListener<TSchema>): () => void;

  /**
   * Presence API for ephemeral per-user data.
   * Only available when presence schema is provided in options.
   */
  readonly presence: TPresence extends Presence.AnyPresence
    ? ClientPresence<Presence.Infer<TPresence>>
    : undefined;
}

// =============================================================================
// Client Document Implementation
// =============================================================================

/**
 * Creates a new ClientDocument for the given schema.
 */
export const make = <
  TSchema extends Primitive.AnyPrimitive,
  TPresence extends Presence.AnyPresence | undefined = undefined
>(
  options: ClientDocumentOptions<TSchema, TPresence>
): ClientDocument<TSchema, TPresence> => {
  const {
    schema,
    transport,
    initialState,
    initialVersion = 0,
    onRejection,
    onStateChange,
    onConnectionChange,
    onReady,
    transactionTimeout = 30000,
    initTimeout = 10000,
    debug = false,
    presence: presenceSchema,
    initialPresence,
  } = options;

  // ==========================================================================
  // Internal State
  // ==========================================================================

  // Server-confirmed state
  let _serverState: Primitive.InferState<TSchema> | undefined = initialState;
  let _serverVersion = initialVersion;

  // Pending transactions queue
  let _pending: PendingTransaction[] = [];

  // Server transactions received (for rebase after rejection)
  let _serverTransactionHistory: Transaction.Transaction[] = [];
  const MAX_HISTORY_SIZE = 100;

  // The underlying document for optimistic state
  let _optimisticDoc = Document.make(schema, { initial: _serverState });

  // Subscription cleanup
  let _unsubscribe: (() => void) | null = null;

  // Timeout handles for pending transactions
  const _timeoutHandles = new Map<string, ReturnType<typeof setTimeout>>();

  // Initialization state - handles buffering during startup
  let _initState: InitState = initialState !== undefined
    ? { type: "ready" }
    : { type: "uninitialized" };

  // Init timeout handle
  let _initTimeoutHandle: ReturnType<typeof setTimeout> | null = null;

  // Promise resolver for connect() to wait for ready state
  let _initResolver: (() => void) | null = null;
  let _initRejecter: ((error: Error) => void) | null = null;

  // Subscribers for events (added after creation via subscribe())
  const _subscribers = new Set<ClientDocumentListener<TSchema>>();

  // ==========================================================================
  // Presence State (only used when presenceSchema is provided)
  // ==========================================================================

  // This client's connection ID (received from presence_snapshot)
  let _presenceSelfId: string | undefined = undefined;

  // This client's current presence data
  let _presenceSelfData: unknown = undefined;

  // Other clients' presence entries (connectionId -> entry)
  const _presenceOthers = new Map<string, Presence.PresenceEntry<unknown>>();

  // Presence change subscribers
  const _presenceSubscribers = new Set<PresenceListener<unknown>>();

  // ==========================================================================
  // Debug Logging
  // ==========================================================================

  /**
   * Debug logging helper that only logs when debug is enabled.
   */
  const debugLog = (...args: unknown[]): void => {
    if (debug) {
      console.log("[ClientDocument]", ...args);
    }
  };

  // ==========================================================================
  // Notification Helpers
  // ==========================================================================

  /**
   * Notifies all listeners of a state change.
   */
  const notifyStateChange = (state: Primitive.InferState<TSchema> | undefined): void => {
    debugLog("notifyStateChange", {
      state,
      subscriberCount: _subscribers.size,
      hasOnStateChange: !!onStateChange,
    });
    onStateChange?.(state);
    for (const listener of _subscribers) {
      listener.onStateChange?.(state);
    }
  };

  /**
   * Notifies all listeners of a connection change.
   */
  const notifyConnectionChange = (connected: boolean): void => {
    debugLog("notifyConnectionChange", {
      connected,
      subscriberCount: _subscribers.size,
      hasOnConnectionChange: !!onConnectionChange,
    });
    onConnectionChange?.(connected);
    for (const listener of _subscribers) {
      listener.onConnectionChange?.(connected);
    }
  };

  /**
   * Notifies all listeners when ready.
   */
  const notifyReady = (): void => {
    debugLog("notifyReady", {
      subscriberCount: _subscribers.size,
      hasOnReady: !!onReady,
    });
    onReady?.();
    for (const listener of _subscribers) {
      listener.onReady?.();
    }
  };

  /**
   * Notifies all presence listeners of a change.
   */
  const notifyPresenceChange = (): void => {
    debugLog("notifyPresenceChange", {
      subscriberCount: _presenceSubscribers.size,
    });
    for (const listener of _presenceSubscribers) {
      try {
        listener.onPresenceChange?.();
      } catch {
        // Ignore listener errors
      }
    }
  };

  // ==========================================================================
  // Presence Handlers
  // ==========================================================================

  /**
   * Handles incoming presence snapshot from server.
   */
  const handlePresenceSnapshot = (message: Transport.PresenceSnapshotMessage): void => {
    if (!presenceSchema) return;

    debugLog("handlePresenceSnapshot", {
      selfId: message.selfId,
      presenceCount: Object.keys(message.presences).length,
    });

    _presenceSelfId = message.selfId;
    _presenceOthers.clear();

    // Populate others from snapshot (exclude self)
    for (const [id, entry] of Object.entries(message.presences)) {
      if (id !== message.selfId) {
        _presenceOthers.set(id, entry);
      }
    }

    notifyPresenceChange();
  };

  /**
   * Handles incoming presence update from server (another user).
   */
  const handlePresenceUpdate = (message: Transport.PresenceUpdateMessage): void => {
    if (!presenceSchema) return;

    debugLog("handlePresenceUpdate", {
      id: message.id,
      userId: message.userId,
    });

    _presenceOthers.set(message.id, {
      data: message.data,
      userId: message.userId,
    });

    notifyPresenceChange();
  };

  /**
   * Handles incoming presence remove from server (user disconnected).
   */
  const handlePresenceRemove = (message: Transport.PresenceRemoveMessage): void => {
    if (!presenceSchema) return;

    debugLog("handlePresenceRemove", {
      id: message.id,
    });

    _presenceOthers.delete(message.id);
    notifyPresenceChange();
  };

  /**
   * Clears all presence state (on disconnect).
   */
  const clearPresenceState = (): void => {
    _presenceSelfId = undefined;
    _presenceSelfData = undefined;
    _presenceOthers.clear();
    notifyPresenceChange();
  };

  // ==========================================================================
  // Helper Functions
  // ==========================================================================

  /**
   * Recomputes the optimistic document from server state + pending transactions.
   */
  const recomputeOptimisticState = (): void => {
    debugLog("recomputeOptimisticState", {
      serverVersion: _serverVersion,
      pendingCount: _pending.length,
      serverState: _serverState,
    });

    // Create fresh document from server state (use initialState for raw state format)
    _optimisticDoc = Document.make(schema, { initialState: _serverState });

    // Apply all pending transactions
    for (const pending of _pending) {
      _optimisticDoc.apply(pending.transaction.ops);
    }

    const newState = _optimisticDoc.get();
    debugLog("recomputeOptimisticState: new optimistic state", newState);

    // Notify state change
    notifyStateChange(newState);
  };

  /**
   * Adds a transaction to pending queue and sends to server.
   */
  const submitTransaction = (tx: Transaction.Transaction): void => {
    if (!transport.isConnected()) {
      throw new NotConnectedError();
    }

    debugLog("submitTransaction", {
      txId: tx.id,
      ops: tx.ops,
      pendingCount: _pending.length + 1,
    });

    const pending: PendingTransaction = {
      transaction: tx,
      original: tx,
      sentAt: Date.now(),
    };

    _pending.push(pending);

    // Set timeout for this transaction
    const timeoutHandle = setTimeout(() => {
      handleTransactionTimeout(tx.id);
    }, transactionTimeout);
    _timeoutHandles.set(tx.id, timeoutHandle);

    // Send to server
    transport.send(tx);
    debugLog("submitTransaction: sent to server", { txId: tx.id });
  };

  /**
   * Handles a transaction timeout.
   */
  const handleTransactionTimeout = (txId: string): void => {
    debugLog("handleTransactionTimeout", { txId });
    const index = _pending.findIndex((p) => p.transaction.id === txId);
    if (index === -1) {
      debugLog("handleTransactionTimeout: transaction not found (already confirmed/rejected)", { txId });
      return; // Already confirmed or rejected
    }

    // Remove from pending
    const [removed] = _pending.splice(index, 1);
    _timeoutHandles.delete(txId);

    debugLog("handleTransactionTimeout: removed from pending", {
      txId,
      remainingPending: _pending.length,
    });

    // Recompute state
    recomputeOptimisticState();

    // Notify as rejection
    onRejection?.(removed!.transaction, "Transaction timed out");
  };

  /**
   * Handles an incoming server transaction.
   */
  const handleServerTransaction = (
    serverTx: Transaction.Transaction,
    version: number
  ): void => {
    debugLog("handleServerTransaction", {
      txId: serverTx.id,
      version,
      ops: serverTx.ops,
      currentServerVersion: _serverVersion,
      pendingCount: _pending.length,
    });

    // Update server version
    _serverVersion = version;

    // Check if this is one of our pending transactions (ACK)
    const pendingIndex = _pending.findIndex(
      (p) => p.transaction.id === serverTx.id
    );

    if (pendingIndex !== -1) {
      // This is our transaction - confirmed!
      debugLog("handleServerTransaction: transaction confirmed (ACK)", {
        txId: serverTx.id,
        pendingIndex,
      });

      const confirmed = _pending[pendingIndex]!;

      // Clear timeout
      const timeoutHandle = _timeoutHandles.get(serverTx.id);
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        _timeoutHandles.delete(serverTx.id);
      }

      // Remove from pending
      _pending.splice(pendingIndex, 1);

      // Apply to server state
      const tempDoc = Document.make(schema, { initial: _serverState });
      tempDoc.apply(serverTx.ops);
      _serverState = tempDoc.get();

      debugLog("handleServerTransaction: updated server state", {
        txId: serverTx.id,
        newServerState: _serverState,
        remainingPending: _pending.length,
      });

      // Recompute optimistic state (pending txs already applied, just need to update base)
      recomputeOptimisticState();
    } else {
      // This is someone else's transaction - need to rebase
      debugLog("handleServerTransaction: remote transaction, rebasing pending", {
        txId: serverTx.id,
        pendingCount: _pending.length,
      });

      // Apply to server state
      const tempDoc = Document.make(schema, { initial: _serverState });
      tempDoc.apply(serverTx.ops);
      _serverState = tempDoc.get();

      // Add to history for potential rebase after rejection
      _serverTransactionHistory.push(serverTx);
      if (_serverTransactionHistory.length > MAX_HISTORY_SIZE) {
        _serverTransactionHistory.shift();
      }

      // Rebase all pending transactions using primitive-based transformation
      const rebasedPending = _pending.map((p) => ({
        ...p,
        transaction: Rebase.transformTransactionWithPrimitive(p.transaction, serverTx, schema),
      }));

      debugLog("handleServerTransaction: rebased pending transactions", {
        txId: serverTx.id,
        rebasedCount: rebasedPending.length,
        originalPendingIds: _pending.map((p) => p.transaction.id),
        rebasedPendingIds: rebasedPending.map((p) => p.transaction.id),
      });

      _pending = rebasedPending;

      // Recompute optimistic state
      recomputeOptimisticState();
    }
  };

  /**
   * Handles a transaction rejection from the server.
   */
  const handleRejection = (txId: string, reason: string): void => {
    debugLog("handleRejection", {
      txId,
      reason,
      pendingCount: _pending.length,
    });

    const index = _pending.findIndex((p) => p.transaction.id === txId);
    if (index === -1) {
      debugLog("handleRejection: transaction not found (already removed)", { txId });
      return; // Already removed
    }

    const rejected = _pending[index]!;

    // Clear timeout
    const timeoutHandle = _timeoutHandles.get(txId);
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      _timeoutHandles.delete(txId);
    }

    // Remove rejected transaction
    _pending.splice(index, 1);

    debugLog("handleRejection: removed rejected transaction, rebasing remaining", {
      txId,
      remainingPending: _pending.length,
      serverHistorySize: _serverTransactionHistory.length,
    });

    // Re-transform remaining pending transactions without the rejected one
    // We need to replay from their original state
    const remainingOriginals = _pending.map((p) => p.original);
    const retransformed = Rebase.rebaseAfterRejectionWithPrimitive(
      [...remainingOriginals, rejected.original],
      txId,
      _serverTransactionHistory,
      schema
    );

    // Update pending with retransformed versions
    _pending = _pending.map((p, i) => ({
      ...p,
      transaction: retransformed[i] ?? p.transaction,
    }));

    debugLog("handleRejection: rebased remaining transactions", {
      txId,
      rebasedCount: _pending.length,
    });

    // Recompute optimistic state
    recomputeOptimisticState();

    // Notify rejection
    onRejection?.(rejected.original, reason);
  };

  /**
   * Handles a snapshot from the server.
   * @param isInitialSnapshot - If true, this is the initial sync snapshot
   */
  const handleSnapshot = (state: unknown, version: number, isInitialSnapshot: boolean = false): void => {
    debugLog("handleSnapshot", {
      isInitialSnapshot,
      version,
      currentServerVersion: _serverVersion,
      pendingCount: _pending.length,
      state,
    });

    if (!isInitialSnapshot) {
      debugLog("handleSnapshot: non-initial snapshot, clearing pending transactions", {
        clearedPendingCount: _pending.length,
      });

      // For non-initial snapshots, clear all pending (they're now invalid)
      for (const handle of _timeoutHandles.values()) {
        clearTimeout(handle);
      }
      _timeoutHandles.clear();

      // Notify rejections for all pending
      for (const pending of _pending) {
        onRejection?.(pending.original, "State reset due to resync");
      }

      _pending = [];
    }

    _serverTransactionHistory = [];
    _serverState = state as Primitive.InferState<TSchema>;
    _serverVersion = version;

    debugLog("handleSnapshot: updated server state", {
      newVersion: _serverVersion,
      newState: _serverState,
    });

    // Recompute optimistic state (now equals server state)
    recomputeOptimisticState();
  };

  /**
   * Processes buffered messages after receiving the initial snapshot.
   * Filters out transactions already included in the snapshot (version <= snapshotVersion)
   * and applies newer transactions in order.
   */
  const processBufferedMessages = (
    bufferedMessages: Transport.ServerMessage[],
    snapshotVersion: number
  ): void => {
    debugLog("processBufferedMessages", {
      bufferedCount: bufferedMessages.length,
      snapshotVersion,
    });

    // Sort transactions by version to ensure correct order
    const sortedMessages = [...bufferedMessages].sort((a, b) => {
      if (a.type === "transaction" && b.type === "transaction") {
        return a.version - b.version;
      }
      return 0;
    });

    // Process each buffered message
    for (const message of sortedMessages) {
      switch (message.type) {
        case "transaction":
          // Only apply transactions with version > snapshot version
          if (message.version > snapshotVersion) {
            debugLog("processBufferedMessages: applying buffered transaction", {
              txId: message.transaction.id,
              version: message.version,
              snapshotVersion,
            });
            handleServerTransaction(message.transaction, message.version);
          } else {
            debugLog("processBufferedMessages: skipping buffered transaction (already in snapshot)", {
              txId: message.transaction.id,
              version: message.version,
              snapshotVersion,
            });
          }
          break;
        case "error":
          // Errors are still relevant - pass through
          debugLog("processBufferedMessages: processing buffered error", {
            txId: message.transactionId,
            reason: message.reason,
          });
          handleRejection(message.transactionId, message.reason);
          break;
        // Ignore additional snapshots in buffer - we already have one
      }
    }
  };

  /**
   * Completes initialization and transitions to ready state.
   */
  const completeInitialization = (): void => {
    debugLog("completeInitialization");

    // Clear init timeout
    if (_initTimeoutHandle !== null) {
      clearTimeout(_initTimeoutHandle);
      _initTimeoutHandle = null;
    }

    _initState = { type: "ready" };

    // Resolve the connect promise
    if (_initResolver) {
      _initResolver();
      _initResolver = null;
      _initRejecter = null;
    }

    debugLog("completeInitialization: ready", {
      serverVersion: _serverVersion,
      serverState: _serverState,
    });

    // Notify ready
    notifyReady();
  };

  /**
   * Handles initialization timeout.
   */
  const handleInitTimeout = (): void => {
    debugLog("handleInitTimeout: initialization timed out");
    _initTimeoutHandle = null;

    // Reject the connect promise
    if (_initRejecter) {
      const error = new Error("Initialization timed out waiting for snapshot");
      _initRejecter(error);
      _initResolver = null;
      _initRejecter = null;
    }

    // Reset to uninitialized state
    _initState = { type: "uninitialized" };
  };

  /**
   * Handles incoming server messages.
   * During initialization, messages are buffered until the snapshot arrives.
   * Presence messages are always processed immediately (not buffered).
   */
  const handleServerMessage = (message: Transport.ServerMessage): void => {
    debugLog("handleServerMessage", {
      messageType: message.type,
      initState: _initState.type,
    });

    // Presence messages are always handled immediately (not buffered)
    // This allows presence to work even during document initialization
    if (message.type === "presence_snapshot") {
      handlePresenceSnapshot(message);
      return;
    }
    if (message.type === "presence_update") {
      handlePresenceUpdate(message);
      return;
    }
    if (message.type === "presence_remove") {
      handlePresenceRemove(message);
      return;
    }

    // Handle based on initialization state
    if (_initState.type === "initializing") {
      if (message.type === "snapshot") {
        debugLog("handleServerMessage: received snapshot during initialization", {
          version: message.version,
          bufferedCount: _initState.bufferedMessages.length,
        });
        // Snapshot received - apply it and process buffered messages
        const buffered = _initState.bufferedMessages;
        handleSnapshot(message.state, message.version, true);
        processBufferedMessages(buffered, message.version);
        completeInitialization();
      } else {
        debugLog("handleServerMessage: buffering message during initialization", {
          messageType: message.type,
          bufferedCount: _initState.bufferedMessages.length + 1,
        });
        // Buffer other messages during initialization
        _initState.bufferedMessages.push(message);
      }
      return;
    }

    // Normal message handling when ready (or uninitialized with initial state)
    switch (message.type) {
      case "transaction":
        handleServerTransaction(message.transaction, message.version);
        break;
      case "snapshot":
        handleSnapshot(message.state, message.version, false);
        break;
      case "error":
        handleRejection(message.transactionId, message.reason);
        break;
    }
  };

  // ==========================================================================
  // Public API
  // ==========================================================================

  const clientDocument = {
    schema,

    get root() {
      return _optimisticDoc.root;
    },

    get: () => _optimisticDoc.get(),

    getServerState: () => _serverState,

    getServerVersion: () => _serverVersion,

    getPendingCount: () => _pending.length,

    hasPendingChanges: () => _pending.length > 0,

    transaction: <R,>(fn: (root: Primitive.InferProxy<TSchema>) => R): R => {
      debugLog("transaction: starting", {
        isConnected: transport.isConnected(),
        isReady: _initState.type === "ready",
        pendingCount: _pending.length,
      });

      if (!transport.isConnected()) {
        throw new NotConnectedError();
      }

      if (_initState.type !== "ready") {
        throw new InvalidStateError("Client is not ready. Wait for initialization to complete.");
      }

      // Run the transaction on the optimistic document
      const result = _optimisticDoc.transaction(fn);

      // Flush and get the transaction
      const tx = _optimisticDoc.flush();

      // If there are operations, submit to server
      if (!Transaction.isEmpty(tx)) {
        debugLog("transaction: flushed, submitting", {
          txId: tx.id,
          opsCount: tx.ops.length,
        });
        submitTransaction(tx);
      } else {
        debugLog("transaction: flushed, empty transaction (no ops)");
      }

      // Notify state change
      notifyStateChange(_optimisticDoc.get());

      return result;
    },

    connect: async (): Promise<void> => {
      debugLog("connect: starting");
      // Subscribe to server messages
      _unsubscribe = transport.subscribe(handleServerMessage);

      // Connect transport
      await transport.connect();
      debugLog("connect: transport connected");

      notifyConnectionChange(true);

      // Set initial presence if provided
      if (presenceSchema && initialPresence !== undefined) {
        debugLog("connect: setting initial presence", { initialPresence });
        const validated = Presence.validate(presenceSchema, initialPresence);
        _presenceSelfData = validated;
        transport.sendPresenceSet(validated);
        notifyPresenceChange();
      }

      // If we already have initial state, we're ready immediately
      if (_initState.type === "ready") {
        debugLog("connect: already ready (has initial state)");
        notifyReady();
        return;
      }

      // Enter initializing state - buffer messages until snapshot arrives
      _initState = { type: "initializing", bufferedMessages: [] };
      debugLog("connect: entering initializing state", {
        initTimeout,
      });

      // Set up initialization timeout
      _initTimeoutHandle = setTimeout(handleInitTimeout, initTimeout);

      // Create a promise that resolves when we're ready
      const readyPromise = new Promise<void>((resolve, reject) => {
        _initResolver = resolve;
        _initRejecter = reject;
      });

      // Request initial snapshot
      debugLog("connect: requesting initial snapshot");
   
      transport.requestSnapshot();


      // Wait for initialization to complete
      await readyPromise;
      debugLog("connect: completed");
    },

    disconnect: (): void => {
      debugLog("disconnect: starting", {
        pendingCount: _pending.length,
        initState: _initState.type,
      });

      // Clear all timeouts
      for (const handle of _timeoutHandles.values()) {
        clearTimeout(handle);
      }
      _timeoutHandles.clear();

      // Clear init timeout
      if (_initTimeoutHandle !== null) {
        clearTimeout(_initTimeoutHandle);
        _initTimeoutHandle = null;
      }

      // Reject any pending init promise
      if (_initRejecter) {
        _initRejecter(new Error("Disconnected during initialization"));
        _initResolver = null;
        _initRejecter = null;
      }

      // Reset init state
      if (_initState.type === "initializing") {
        _initState = { type: "uninitialized" };
      }

      // Clear presence state
      clearPresenceState();

      // Unsubscribe
      if (_unsubscribe) {
        _unsubscribe();
        _unsubscribe = null;
      }

      // Disconnect transport
      transport.disconnect();

      notifyConnectionChange(false);
      debugLog("disconnect: completed");
    },

    isConnected: () => transport.isConnected(),

    isReady: () => _initState.type === "ready",

    resync: (): void => {
      debugLog("resync: requesting snapshot", {
        currentVersion: _serverVersion,
        pendingCount: _pending.length,
      });
      if (!transport.isConnected()) {
        throw new NotConnectedError();
      }
      transport.requestSnapshot();
    },

    subscribe: (listener: ClientDocumentListener<TSchema>): (() => void) => {
      _subscribers.add(listener);
      return () => {
        _subscribers.delete(listener);
      };
    },

    // =========================================================================
    // Presence API
    // =========================================================================

    presence: (presenceSchema
      ? {
          selfId: () => _presenceSelfId,

          self: () => _presenceSelfData as Presence.Infer<NonNullable<TPresence>> | undefined,

          others: () => _presenceOthers as ReadonlyMap<string, Presence.PresenceEntry<Presence.Infer<NonNullable<TPresence>>>>,

          all: () => {
            const all = new Map<string, Presence.PresenceEntry<unknown>>();
            // Add others
            for (const [id, entry] of _presenceOthers) {
              all.set(id, entry);
            }
            // Add self if we have data
            if (_presenceSelfId !== undefined && _presenceSelfData !== undefined) {
              all.set(_presenceSelfId, { data: _presenceSelfData });
            }
            return all as ReadonlyMap<string, Presence.PresenceEntry<Presence.Infer<NonNullable<TPresence>>>>;
          },

          set: (data: Presence.Infer<NonNullable<TPresence>>) => {
            if (!presenceSchema) return;

            // Validate against schema (throws if invalid)
            const validated = Presence.validate(presenceSchema, data);

            debugLog("presence.set", { data: validated });

            // Update local state
            _presenceSelfData = validated;

            // Send to server
            transport.sendPresenceSet(validated);

            // Notify listeners
            notifyPresenceChange();
          },

          clear: () => {
            if (!presenceSchema) return;

            debugLog("presence.clear");

            // Clear local state
            _presenceSelfData = undefined;

            // Send to server
            transport.sendPresenceClear();

            // Notify listeners
            notifyPresenceChange();
          },

          subscribe: (listener: PresenceListener<Presence.Infer<NonNullable<TPresence>>>) => {
            _presenceSubscribers.add(listener as PresenceListener<unknown>);
            return () => {
              _presenceSubscribers.delete(listener as PresenceListener<unknown>);
            };
          },
        }
      : undefined) as TPresence extends Presence.AnyPresence
      ? ClientPresence<Presence.Infer<TPresence>>
      : undefined,
  } as ClientDocument<TSchema, TPresence>;

  return clientDocument;
};
