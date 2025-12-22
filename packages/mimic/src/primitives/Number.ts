import { Schema } from "effect";
import * as OperationDefinition from "../OperationDefinition";
import * as Operation from "../Operation";
import * as OperationPath from "../OperationPath";
import * as ProxyEnvironment from "../ProxyEnvironment";
import * as Transform from "../Transform";
import type { Primitive, PrimitiveInternal, MaybeUndefined, AnyPrimitive, Validator } from "../Primitive";
import { ValidationError } from "../Primitive";
import { runValidators, isCompatibleOperation } from "./shared";


export interface NumberProxy<TDefined extends boolean = false> {
  /** Gets the current number value */
  get(): MaybeUndefined<number, TDefined>;
  /** Sets the number value, generating a number.set operation */
  set(value: number): void;
  /** Returns a readonly snapshot of the number value for rendering */
  toSnapshot(): MaybeUndefined<number, TDefined>;
}

interface NumberPrimitiveSchema {
  readonly required: boolean;
  readonly defaultValue: number | undefined;
  readonly validators: readonly Validator<number>[];
}

export class NumberPrimitive<TDefined extends boolean = false, THasDefault extends boolean = false> implements Primitive<number, NumberProxy<TDefined>, TDefined, THasDefault> {
  readonly _tag = "NumberPrimitive" as const;
  readonly _State!: number;
  readonly _Proxy!: NumberProxy<TDefined>;
  readonly _TDefined!: TDefined;
  readonly _THasDefault!: THasDefault;

  private readonly _schema: NumberPrimitiveSchema;

  private readonly _opDefinitions = {
    set: OperationDefinition.make({
      kind: "number.set" as const,
      payload: Schema.Number,
      target: Schema.Number,
      apply: (payload) => payload,
    }),
  };

  constructor(schema: NumberPrimitiveSchema) {
    this._schema = schema;
  }

  /** Mark this number as required */
  required(): NumberPrimitive<true, THasDefault> {
    return new NumberPrimitive({
      ...this._schema,
      required: true,
    });
  }

  /** Set a default value for this number */
  default(defaultValue: number): NumberPrimitive<true, true> {
    return new NumberPrimitive({
      ...this._schema,
      defaultValue,
    });
  }

  /** Add a custom validation rule */
  refine(fn: (value: number) => boolean, message: string): NumberPrimitive<TDefined, THasDefault> {
    return new NumberPrimitive({
      ...this._schema,
      validators: [...this._schema.validators, { validate: fn, message }],
    });
  }

  /** Minimum value (inclusive) */
  min(value: number): NumberPrimitive<TDefined, THasDefault> {
    return this.refine(
      (v) => v >= value,
      `Number must be at least ${value}`
    );
  }

  /** Maximum value (inclusive) */
  max(value: number): NumberPrimitive<TDefined, THasDefault> {
    return this.refine(
      (v) => v <= value,
      `Number must be at most ${value}`
    );
  }

  /** Must be positive (> 0) */
  positive(): NumberPrimitive<TDefined, THasDefault> {
    return this.refine(
      (v) => v > 0,
      "Number must be positive"
    );
  }

  /** Must be negative (< 0) */
  negative(): NumberPrimitive<TDefined, THasDefault> {
    return this.refine(
      (v) => v < 0,
      "Number must be negative"
    );
  }

  /** Must be an integer */
  int(): NumberPrimitive<TDefined, THasDefault> {
    return this.refine(
      (v) => globalThis.Number.isInteger(v),
      "Number must be an integer"
    );
  }

  readonly _internal: PrimitiveInternal<number, NumberProxy<TDefined>> = {
    createProxy: (env: ProxyEnvironment.ProxyEnvironment, operationPath: OperationPath.OperationPath): NumberProxy<TDefined> => {
      const defaultValue = this._schema.defaultValue;
      return {
        get: (): MaybeUndefined<number, TDefined> => {
          const state = env.getState(operationPath) as number | undefined;
          return (state ?? defaultValue) as MaybeUndefined<number, TDefined>;
        },
        set: (value: number) => {
          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.set, value)
          );
        },
        toSnapshot: (): MaybeUndefined<number, TDefined> => {
          const state = env.getState(operationPath) as number | undefined;
          return (state ?? defaultValue) as MaybeUndefined<number, TDefined>;
        },
      };
    },

    applyOperation: (_state: number | undefined, operation: Operation.Operation<any, any, any>): number => {
      if (operation.kind !== "number.set") {
        throw new ValidationError(`NumberPrimitive cannot apply operation of kind: ${operation.kind}`);
      }

      const payload = operation.payload;
      if (typeof payload !== "number") {
        throw new ValidationError(`NumberPrimitive.set requires a number payload, got: ${typeof payload}`);
      }

      // Run validators
      runValidators(payload, this._schema.validators);

      return payload;
    },

    getInitialState: (): number | undefined => {
      return this._schema.defaultValue;
    },

    transformOperation: (
      clientOp: Operation.Operation<any, any, any>,
      serverOp: Operation.Operation<any, any, any>
    ): Transform.TransformResult => {
      // If paths don't overlap, no transformation needed
      if (!OperationPath.pathsOverlap(clientOp.path, serverOp.path)) {
        return { type: "transformed", operation: clientOp };
      }

      // For same path, client wins (last-write-wins)
      return { type: "transformed", operation: clientOp };
    },
  };
}

/** Creates a new NumberPrimitive */
export const Number = (): NumberPrimitive<false, false> =>
  new NumberPrimitive({ required: false, defaultValue: undefined, validators: [] });

