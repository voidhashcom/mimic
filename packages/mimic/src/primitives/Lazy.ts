import { Effect, Schema } from "effect";
import * as OperationDefinition from "../OperationDefinition";
import * as Operation from "../Operation";
import * as OperationPath from "../OperationPath";
import * as ProxyEnvironment from "../ProxyEnvironment";
import * as Transform from "../Transform";
import type { Primitive, PrimitiveInternal, AnyPrimitive, InferState, InferProxy, InferSnapshot } from "../Primitive";
import { ValidationError } from "../Primitive";
import { runValidators } from "./shared";


/**
 * Type to infer state from a lazy thunk
 */
export type InferLazyState<T extends () => AnyPrimitive> = InferState<ReturnType<T>>;

/**
 * Type to infer proxy from a lazy thunk
 */
export type InferLazyProxy<T extends () => AnyPrimitive> = InferProxy<ReturnType<T>>;

/**
 * Type to infer snapshot from a lazy thunk
 */
export type InferLazySnapshot<T extends () => AnyPrimitive> = InferSnapshot<ReturnType<T>>;

export class LazyPrimitive<TThunk extends () => AnyPrimitive>
  implements Primitive<InferLazyState<TThunk>, InferLazyProxy<TThunk>>
{
  readonly _tag = "LazyPrimitive" as const;
  readonly _State!: InferLazyState<TThunk>;
  readonly _Proxy!: InferLazyProxy<TThunk>;

  private readonly _thunk: TThunk;
  private _resolved: ReturnType<TThunk> | undefined;

  constructor(thunk: TThunk) {
    this._thunk = thunk;
  }

  /** Resolve and cache the lazy primitive */
  private _resolve(): ReturnType<TThunk> {
    if (this._resolved === undefined) {
      this._resolved = this._thunk() as ReturnType<TThunk>;
    }
    return this._resolved;
  }

  /** Mark this lazy primitive as required (delegates to resolved) */
  required(): LazyPrimitive<TThunk> {
    // Note: For lazy, we can't easily propagate required to the resolved primitive
    // without resolving it first. This is a limitation.
    return this;
  }

  readonly _internal: PrimitiveInternal<InferLazyState<TThunk>, InferLazyProxy<TThunk>> = {
    createProxy: (env: ProxyEnvironment.ProxyEnvironment, operationPath: OperationPath.OperationPath): InferLazyProxy<TThunk> => {
      const resolved = this._resolve();
      return resolved._internal.createProxy(env, operationPath) as InferLazyProxy<TThunk>;
    },

    applyOperation: (
      state: InferLazyState<TThunk> | undefined,
      operation: Operation.Operation<any, any, any>
    ): InferLazyState<TThunk> => {
      const resolved = this._resolve();
      return resolved._internal.applyOperation(state, operation) as InferLazyState<TThunk>;
    },

    getInitialState: (): InferLazyState<TThunk> | undefined => {
      const resolved = this._resolve();
      return resolved._internal.getInitialState() as InferLazyState<TThunk> | undefined;
    },

    transformOperation: (
      clientOp: Operation.Operation<any, any, any>,
      serverOp: Operation.Operation<any, any, any>
    ): Transform.TransformResult => {
      // Delegate to resolved primitive
      const resolved = this._resolve();
      return resolved._internal.transformOperation(clientOp, serverOp);
    },
  };
}

/** Creates a new LazyPrimitive with the given thunk */
export const Lazy = <TThunk extends () => AnyPrimitive>(thunk: TThunk): LazyPrimitive<TThunk> =>
  new LazyPrimitive(thunk);

