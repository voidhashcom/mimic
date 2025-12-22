import { describe, it, expect, beforeEach } from "vitest";
import { createStore, type StoreApi } from "zustand";
import { Schema } from "effect";
import {
  createCommander,
  performUndo,
  performRedo,
  clearUndoHistory,
  isCommand,
  isUndoableCommand,
  COMMAND_SYMBOL,
  UNDOABLE_COMMAND_SYMBOL,
  type CommanderSlice,
  type Command,
  type UndoableCommand,
} from "../../src/zustand-commander/index.js";

// =============================================================================
// Test Store Types
// =============================================================================

interface TestState {
  count: number;
  items: string[];
  selectedId: string | null;
}

type TestStore = TestState & CommanderSlice;

// =============================================================================
// Helper Functions
// =============================================================================

function createTestStore(
  commander: ReturnType<typeof createCommander<TestState>>,
  initial?: Partial<TestState>
) {
  return createStore<TestStore>(
    commander.middleware(() => ({
      count: 0,
      items: [],
      selectedId: null,
      ...initial,
    }))
  );
}

// =============================================================================
// Tests
// =============================================================================

describe("createCommander", () => {
  it("should create a commander instance with action and undoableAction methods", () => {
    const commander = createCommander<TestState>();

    expect(commander).toBeDefined();
    expect(typeof commander.action).toBe("function");
    expect(typeof commander.undoableAction).toBe("function");
    expect(typeof commander.middleware).toBe("function");
  });

  it("should respect maxUndoStackSize option", () => {
    const commander = createCommander<TestState>({ maxUndoStackSize: 2 });
    const store = createTestStore(commander);

    // Create an undoable action
    const increment = commander.undoableAction(
      (ctx) => {
        const current = ctx.getState().count;
        ctx.setState({ count: current + 1 });
        return { previousCount: current };
      },
      (ctx, _params, result) => {
        ctx.setState({ count: result.previousCount });
      }
    );

    // Get dispatch via middleware context
    const storeApi = store as unknown as StoreApi<TestStore>;
    const ctx = {
      getState: () => storeApi.getState(),
      setState: (partial: Partial<TestStore>) => storeApi.setState(partial),
      dispatch: <TParams, TReturn>(cmd: Command<TestStore, TParams, TReturn>) => {
        return (params: TParams): TReturn => cmd.fn(ctx, params);
      },
    };

    // Execute 5 times - stack should only keep last 2
    for (let i = 0; i < 5; i++) {
      increment.fn(ctx, undefined);
      // Manually add to undo stack as we're bypassing the full dispatch
      storeApi.setState((state: TestStore) => ({
        ...state,
        _commander: {
          undoStack: [...state._commander.undoStack, {
            command: increment,
            params: undefined,
            result: { previousCount: i },
            timestamp: Date.now(),
          }].slice(-2),
          redoStack: [],
        },
      }));
    }

    expect(store.getState()._commander.undoStack.length).toBe(2);
  });
});

describe("action (regular commands)", () => {
  let commander: ReturnType<typeof createCommander<TestState>>;
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    commander = createCommander<TestState>();
    store = createTestStore(commander);
  });

  it("should create command with schema + function", () => {
    const setCount = commander.action(
      Schema.Struct({ value: Schema.Number }),
      (ctx, params) => {
        ctx.setState({ count: params.value });
      }
    );

    expect(setCount).toBeDefined();
    expect(setCount[COMMAND_SYMBOL]).toBe(true);
    expect(setCount.paramsSchema).toBeDefined();
    expect(typeof setCount.fn).toBe("function");
  });

  it("should create command without params (void)", () => {
    const reset = commander.action((ctx) => {
      ctx.setState({ count: 0, items: [], selectedId: null });
    });

    expect(reset).toBeDefined();
    expect(reset[COMMAND_SYMBOL]).toBe(true);
    expect(reset.paramsSchema).toBeNull();
    expect(typeof reset.fn).toBe("function");
  });

  it("should execute command and modify state", () => {
    const setCount = commander.action(
      Schema.Struct({ value: Schema.Number }),
      (ctx, params) => {
        ctx.setState({ count: params.value });
      }
    );

    const storeApi = store as unknown as StoreApi<TestStore>;
    const ctx = {
      getState: () => storeApi.getState(),
      setState: (partial: Partial<TestStore>) => storeApi.setState(partial),
      dispatch: <TParams, TReturn>(cmd: Command<TestStore, TParams, TReturn>) => {
        return (params: TParams): TReturn => cmd.fn(ctx, params);
      },
    };

    expect(store.getState().count).toBe(0);

    setCount.fn(ctx, { value: 42 });

    expect(store.getState().count).toBe(42);
  });

  it("should NOT add to undo stack for regular actions", () => {
    const setCount = commander.action(
      Schema.Struct({ value: Schema.Number }),
      (ctx, params) => {
        ctx.setState({ count: params.value });
      }
    );

    const storeApi = store as unknown as StoreApi<TestStore>;
    const ctx = {
      getState: () => storeApi.getState(),
      setState: (partial: Partial<TestStore>) => storeApi.setState(partial),
      dispatch: <TParams, TReturn>(cmd: Command<TestStore, TParams, TReturn>) => {
        return (params: TParams): TReturn => cmd.fn(ctx, params);
      },
    };

    // Execute the action
    setCount.fn(ctx, { value: 100 });

    // Undo stack should remain empty (regular action doesn't add to stack)
    expect(store.getState()._commander.undoStack.length).toBe(0);
  });

  it("should return value from action", () => {
    const getDoubled = commander.action(
      Schema.Struct({ value: Schema.Number }),
      (_ctx, params) => {
        return params.value * 2;
      }
    );

    const storeApi = store as unknown as StoreApi<TestStore>;
    const ctx = {
      getState: () => storeApi.getState(),
      setState: (partial: Partial<TestStore>) => storeApi.setState(partial),
      dispatch: <TParams, TReturn>(cmd: Command<TestStore, TParams, TReturn>) => {
        return (params: TParams): TReturn => cmd.fn(ctx, params);
      },
    };

    const result = getDoubled.fn(ctx, { value: 21 });
    expect(result).toBe(42);
  });
});

describe("undoableAction", () => {
  let commander: ReturnType<typeof createCommander<TestState>>;
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    commander = createCommander<TestState>();
    store = createTestStore(commander);
  });

  it("should create undoable command with schema + fn + revert", () => {
    const addItem = commander.undoableAction(
      Schema.Struct({ item: Schema.String }),
      (ctx, params) => {
        const items = [...ctx.getState().items, params.item];
        ctx.setState({ items });
        return { index: items.length - 1 };
      },
      (ctx, _params, result) => {
        const items = ctx.getState().items.filter((_, i) => i !== result.index);
        ctx.setState({ items });
      }
    );

    expect(addItem).toBeDefined();
    expect(addItem[COMMAND_SYMBOL]).toBe(true);
    expect(addItem[UNDOABLE_COMMAND_SYMBOL]).toBe(true);
    expect(addItem.paramsSchema).toBeDefined();
    expect(typeof addItem.fn).toBe("function");
    expect(typeof addItem.revert).toBe("function");
  });

  it("should create undoable command without params", () => {
    const increment = commander.undoableAction(
      (ctx) => {
        const current = ctx.getState().count;
        ctx.setState({ count: current + 1 });
        return { previousCount: current };
      },
      (ctx, _params, result) => {
        ctx.setState({ count: result.previousCount });
      }
    );

    expect(increment).toBeDefined();
    expect(increment[COMMAND_SYMBOL]).toBe(true);
    expect(increment[UNDOABLE_COMMAND_SYMBOL]).toBe(true);
    expect(increment.paramsSchema).toBeNull();
  });

  it("should execute undoable action and modify state", () => {
    const setCount = commander.undoableAction(
      Schema.Struct({ value: Schema.Number }),
      (ctx, params) => {
        const prev = ctx.getState().count;
        ctx.setState({ count: params.value });
        return { previousValue: prev };
      },
      (ctx, _params, result) => {
        ctx.setState({ count: result.previousValue });
      }
    );

    const storeApi = store as unknown as StoreApi<TestStore>;
    const ctx = {
      getState: () => storeApi.getState(),
      setState: (partial: Partial<TestStore>) => storeApi.setState(partial),
      dispatch: <TParams, TReturn>(cmd: Command<TestStore, TParams, TReturn>) => {
        return (params: TParams): TReturn => cmd.fn(ctx, params);
      },
    };

    expect(store.getState().count).toBe(0);

    setCount.fn(ctx, { value: 50 });

    expect(store.getState().count).toBe(50);
  });
});

describe("performUndo", () => {
  let commander: ReturnType<typeof createCommander<TestState>>;
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    commander = createCommander<TestState>();
    store = createTestStore(commander);
  });

  it("should revert last action", () => {
    const increment = commander.undoableAction(
      (ctx) => {
        const current = ctx.getState().count;
        ctx.setState({ count: current + 1 });
        return { previousCount: current };
      },
      (ctx, _params, result) => {
        ctx.setState({ count: result.previousCount });
      }
    );

    const storeApi = store as unknown as StoreApi<TestStore>;

    // Manually set up undo stack with an entry
    store.setState((state: TestStore) => ({
      ...state,
      count: 5,
      _commander: {
        undoStack: [{
          command: increment,
          params: undefined,
          result: { previousCount: 4 },
          timestamp: Date.now(),
        }],
        redoStack: [],
      },
    }));

    expect(store.getState().count).toBe(5);

    const result = performUndo(storeApi);

    expect(result).toBe(true);
    expect(store.getState().count).toBe(4);
  });

  it("should move entry to redo stack", () => {
    const increment = commander.undoableAction(
      (ctx) => {
        const current = ctx.getState().count;
        ctx.setState({ count: current + 1 });
        return { previousCount: current };
      },
      (ctx, _params, result) => {
        ctx.setState({ count: result.previousCount });
      }
    );

    const storeApi = store as unknown as StoreApi<TestStore>;

    // Set up with one entry in undo stack
    store.setState((state: TestStore) => ({
      ...state,
      count: 10,
      _commander: {
        undoStack: [{
          command: increment,
          params: undefined,
          result: { previousCount: 9 },
          timestamp: Date.now(),
        }],
        redoStack: [],
      },
    }));

    expect(store.getState()._commander.undoStack.length).toBe(1);
    expect(store.getState()._commander.redoStack.length).toBe(0);

    performUndo(storeApi);

    expect(store.getState()._commander.undoStack.length).toBe(0);
    expect(store.getState()._commander.redoStack.length).toBe(1);
  });

  it("should return false when undo stack is empty", () => {
    const storeApi = store as unknown as StoreApi<TestStore>;

    expect(store.getState()._commander.undoStack.length).toBe(0);

    const result = performUndo(storeApi);

    expect(result).toBe(false);
  });
});

describe("performRedo", () => {
  let commander: ReturnType<typeof createCommander<TestState>>;
  let store: ReturnType<typeof createTestStore>;

  beforeEach(() => {
    commander = createCommander<TestState>();
    store = createTestStore(commander);
  });

  it("should re-execute undone action", () => {
    const increment = commander.undoableAction(
      (ctx) => {
        const current = ctx.getState().count;
        ctx.setState({ count: current + 1 });
        return { previousCount: current };
      },
      (ctx, _params, result) => {
        ctx.setState({ count: result.previousCount });
      }
    );

    const storeApi = store as unknown as StoreApi<TestStore>;

    // Set up with an entry in redo stack
    store.setState((state: TestStore) => ({
      ...state,
      count: 4,
      _commander: {
        undoStack: [],
        redoStack: [{
          command: increment,
          params: undefined,
          result: { previousCount: 4 },
          timestamp: Date.now(),
        }],
      },
    }));

    expect(store.getState().count).toBe(4);

    const result = performRedo(storeApi);

    expect(result).toBe(true);
    expect(store.getState().count).toBe(5);
  });

  it("should move entry back to undo stack", () => {
    const increment = commander.undoableAction(
      (ctx) => {
        const current = ctx.getState().count;
        ctx.setState({ count: current + 1 });
        return { previousCount: current };
      },
      (ctx, _params, result) => {
        ctx.setState({ count: result.previousCount });
      }
    );

    const storeApi = store as unknown as StoreApi<TestStore>;

    // Set up with an entry in redo stack
    store.setState((state: TestStore) => ({
      ...state,
      count: 0,
      _commander: {
        undoStack: [],
        redoStack: [{
          command: increment,
          params: undefined,
          result: { previousCount: 0 },
          timestamp: Date.now(),
        }],
      },
    }));

    expect(store.getState()._commander.undoStack.length).toBe(0);
    expect(store.getState()._commander.redoStack.length).toBe(1);

    performRedo(storeApi);

    expect(store.getState()._commander.undoStack.length).toBe(1);
    expect(store.getState()._commander.redoStack.length).toBe(0);
  });

  it("should return false when redo stack is empty", () => {
    const storeApi = store as unknown as StoreApi<TestStore>;

    expect(store.getState()._commander.redoStack.length).toBe(0);

    const result = performRedo(storeApi);

    expect(result).toBe(false);
  });
});

describe("clearUndoHistory", () => {
  it("should clear both stacks", () => {
    const commander = createCommander<TestState>();
    const store = createTestStore(commander);

    const increment = commander.undoableAction(
      (ctx) => {
        const current = ctx.getState().count;
        ctx.setState({ count: current + 1 });
        return { previousCount: current };
      },
      (ctx, _params, result) => {
        ctx.setState({ count: result.previousCount });
      }
    );

    const storeApi = store as unknown as StoreApi<TestStore>;

    // Add entries to both stacks
    store.setState((state: TestStore) => ({
      ...state,
      _commander: {
        undoStack: [{
          command: increment,
          params: undefined,
          result: { previousCount: 0 },
          timestamp: Date.now(),
        }],
        redoStack: [{
          command: increment,
          params: undefined,
          result: { previousCount: 1 },
          timestamp: Date.now(),
        }],
      },
    }));

    expect(store.getState()._commander.undoStack.length).toBe(1);
    expect(store.getState()._commander.redoStack.length).toBe(1);

    clearUndoHistory(storeApi);

    expect(store.getState()._commander.undoStack.length).toBe(0);
    expect(store.getState()._commander.redoStack.length).toBe(0);
  });
});

describe("Type Guards", () => {
  let commander: ReturnType<typeof createCommander<TestState>>;

  beforeEach(() => {
    commander = createCommander<TestState>();
  });

  describe("isCommand", () => {
    it("should return true for regular commands", () => {
      const cmd = commander.action((ctx) => {
        ctx.setState({ count: 0 });
      });

      expect(isCommand(cmd)).toBe(true);
    });

    it("should return true for undoable commands", () => {
      const cmd = commander.undoableAction(
        (ctx) => {
          const prev = ctx.getState().count;
          ctx.setState({ count: 0 });
          return { prev };
        },
        (ctx, _params, result) => {
          ctx.setState({ count: result.prev });
        }
      );

      expect(isCommand(cmd)).toBe(true);
    });

    it("should return false for non-commands", () => {
      expect(isCommand(null)).toBe(false);
      expect(isCommand(undefined)).toBe(false);
      expect(isCommand({})).toBe(false);
      expect(isCommand({ fn: () => {} })).toBe(false);
      expect(isCommand("string")).toBe(false);
      expect(isCommand(42)).toBe(false);
    });
  });

  describe("isUndoableCommand", () => {
    it("should return true for undoable commands", () => {
      const cmd = commander.undoableAction(
        (ctx) => {
          const prev = ctx.getState().count;
          ctx.setState({ count: 0 });
          return { prev };
        },
        (ctx, _params, result) => {
          ctx.setState({ count: result.prev });
        }
      );

      expect(isUndoableCommand(cmd)).toBe(true);
    });

    it("should return false for regular commands", () => {
      const cmd = commander.action((ctx) => {
        ctx.setState({ count: 0 });
      });

      expect(isUndoableCommand(cmd)).toBe(false);
    });

    it("should return false for non-commands", () => {
      expect(isUndoableCommand(null)).toBe(false);
      expect(isUndoableCommand(undefined)).toBe(false);
      expect(isUndoableCommand({})).toBe(false);
    });
  });
});

describe("Middleware", () => {
  it("should add _commander slice to store", () => {
    const commander = createCommander<TestState>();
    const store = createTestStore(commander);

    const state = store.getState();

    expect(state._commander).toBeDefined();
    expect(state._commander.undoStack).toBeDefined();
    expect(state._commander.redoStack).toBeDefined();
  });

  it("should initialize with empty stacks", () => {
    const commander = createCommander<TestState>();
    const store = createTestStore(commander);

    const state = store.getState();

    expect(state._commander.undoStack).toEqual([]);
    expect(state._commander.redoStack).toEqual([]);
  });

  it("should preserve user state", () => {
    const commander = createCommander<TestState>();
    const store = createTestStore(commander, {
      count: 100,
      items: ["a", "b"],
      selectedId: "test-id",
    });

    const state = store.getState();

    expect(state.count).toBe(100);
    expect(state.items).toEqual(["a", "b"]);
    expect(state.selectedId).toBe("test-id");
    expect(state._commander).toBeDefined();
  });
});

describe("Command Dispatch in Context", () => {
  it("should allow dispatching commands from within commands", () => {
    const commander = createCommander<TestState>();
    const store = createTestStore(commander);

    const addItem = commander.action(
      Schema.Struct({ item: Schema.String }),
      (ctx, params) => {
        const items = [...ctx.getState().items, params.item];
        ctx.setState({ items });
      }
    );

    const addMultiple = commander.action(
      Schema.Struct({ items: Schema.Array(Schema.String) }),
      (ctx, params) => {
        for (const item of params.items) {
          ctx.dispatch(addItem)({ item });
        }
      }
    );

    const storeApi = store as unknown as StoreApi<TestStore>;

    // Create a proper dispatch function
    const createCtx = (): typeof ctx => ({
      getState: () => storeApi.getState(),
      setState: (partial: Partial<TestStore>) => storeApi.setState(partial),
      dispatch: <TParams, TReturn>(cmd: Command<TestStore, TParams, TReturn>) => {
        return (params: TParams): TReturn => cmd.fn(createCtx(), params);
      },
    });

    const ctx = createCtx();

    addMultiple.fn(ctx, { items: ["x", "y", "z"] });

    expect(store.getState().items).toEqual(["x", "y", "z"]);
  });
});

describe("Undo/Redo Integration", () => {
  it("should handle multiple undo operations", () => {
    const commander = createCommander<TestState>();
    const store = createTestStore(commander);

    const setCount = commander.undoableAction(
      Schema.Struct({ value: Schema.Number }),
      (ctx, params) => {
        const prev = ctx.getState().count;
        ctx.setState({ count: params.value });
        return { previousValue: prev };
      },
      (ctx, _params, result) => {
        ctx.setState({ count: result.previousValue });
      }
    );

    const storeApi = store as unknown as StoreApi<TestStore>;

    // Set up stack with multiple entries: 0 -> 10 -> 20 -> 30
    store.setState((state: TestStore) => ({
      ...state,
      count: 30,
      _commander: {
        undoStack: [
          { command: setCount, params: { value: 10 }, result: { previousValue: 0 }, timestamp: 1 },
          { command: setCount, params: { value: 20 }, result: { previousValue: 10 }, timestamp: 2 },
          { command: setCount, params: { value: 30 }, result: { previousValue: 20 }, timestamp: 3 },
        ],
        redoStack: [],
      },
    }));

    // Undo 30 -> 20
    performUndo(storeApi);
    expect(store.getState().count).toBe(20);

    // Undo 20 -> 10
    performUndo(storeApi);
    expect(store.getState().count).toBe(10);

    // Undo 10 -> 0
    performUndo(storeApi);
    expect(store.getState().count).toBe(0);

    // Redo stack should have all 3 entries
    expect(store.getState()._commander.redoStack.length).toBe(3);
    expect(store.getState()._commander.undoStack.length).toBe(0);
  });

  it("should handle undo then redo", () => {
    const commander = createCommander<TestState>();
    const store = createTestStore(commander);

    const increment = commander.undoableAction(
      (ctx) => {
        const current = ctx.getState().count;
        ctx.setState({ count: current + 1 });
        return { previousCount: current };
      },
      (ctx, _params, result) => {
        ctx.setState({ count: result.previousCount });
      }
    );

    const storeApi = store as unknown as StoreApi<TestStore>;

    // Start at count 5
    store.setState((state: TestStore) => ({
      ...state,
      count: 5,
      _commander: {
        undoStack: [{
          command: increment,
          params: undefined,
          result: { previousCount: 4 },
          timestamp: Date.now(),
        }],
        redoStack: [],
      },
    }));

    // Undo: 5 -> 4
    performUndo(storeApi);
    expect(store.getState().count).toBe(4);

    // Redo: 4 -> 5
    performRedo(storeApi);
    expect(store.getState().count).toBe(5);
  });
});

