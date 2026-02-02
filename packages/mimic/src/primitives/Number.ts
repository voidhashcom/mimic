import { Schema } from "effect";
import * as OperationDefinition from "../OperationDefinition";
import * as Operation from "../Operation";
import * as OperationPath from "../OperationPath";
import * as ProxyEnvironment from "../ProxyEnvironment";
import * as Transform from "../Transform";
import type { Primitive, PrimitiveInternal, MaybeUndefined, AnyPrimitive, Validator, NeedsValue } from "./shared";
import { ValidationError, runValidators, isCompatibleOperation } from "./shared";


type InferSetInput<TRequired extends boolean = false, THasDefault extends boolean = false> = NeedsValue<number, TRequired, THasDefault>
type InferUpdateInput<TRequired extends boolean = false, THasDefault extends boolean = false> = NeedsValue<number, TRequired, THasDefault>

export interface NumberProxy<TRequired extends boolean = false, THasDefault extends boolean = false> {
  /** Gets the current number value */
  get(): MaybeUndefined<number, TRequired, THasDefault>;
  /** Sets the number value, generating a number.set operation */
  set(value: InferSetInput<TRequired, THasDefault>): void;
  /** This is the same as set. Updates the number value, generating a number.set operation */
  update(value: InferUpdateInput<TRequired, THasDefault>): void;
  /** Returns a readonly snapshot of the number value for rendering */
  toSnapshot(): MaybeUndefined<number, TRequired, THasDefault>;
}

interface NumberPrimitiveSchema {
  readonly required: boolean;
  readonly defaultValue: number | undefined;
  readonly validators: readonly Validator<number>[];
}

export class NumberPrimitive<TRequired extends boolean = false, THasDefault extends boolean = false> implements Primitive<number, NumberProxy<TRequired, THasDefault>, TRequired, THasDefault, InferSetInput<TRequired, THasDefault>, InferUpdateInput<TRequired, THasDefault>> {
  readonly _tag = "NumberPrimitive" as const;
  readonly _State!: number;
  readonly _Proxy!: NumberProxy<TRequired, THasDefault>;
  readonly _TRequired!: TRequired;
  readonly _THasDefault!: THasDefault;
  readonly TUpdateInput!: InferUpdateInput<TRequired, THasDefault>;
  readonly TSetInput!: InferSetInput<TRequired, THasDefault>;

  private readonly _schema: NumberPrimitiveSchema;

  private readonly _opDefinitions = {
    set: OperationDefinition.make({
      kind: "number.set" as const,
      payload: Schema.Number,
      target: Schema.Number,
      apply: (payload) => payload,
      deduplicable: true,
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
  default(defaultValue: number): NumberPrimitive<TRequired, true> {
    return new NumberPrimitive({
      ...this._schema,
      defaultValue,
    });
  }

  /** Add a custom validation rule */
  refine(fn: (value: number) => boolean, message: string): NumberPrimitive<TRequired, THasDefault> {
    return new NumberPrimitive({
      ...this._schema,
      validators: [...this._schema.validators, { validate: fn, message }],
    });
  }

  /** Minimum value (inclusive) */
  min(value: number): NumberPrimitive<TRequired, THasDefault> {
    return this.refine(
      (v) => v >= value,
      `Number must be at least ${value}`
    );
  }

  /** Maximum value (inclusive) */
  max(value: number): NumberPrimitive<TRequired, THasDefault> {
    return this.refine(
      (v) => v <= value,
      `Number must be at most ${value}`
    );
  }

  /** Must be positive (> 0) */
  positive(): NumberPrimitive<TRequired, THasDefault> {
    return this.refine(
      (v) => v > 0,
      "Number must be positive"
    );
  }

  /** Must be negative (< 0) */
  negative(): NumberPrimitive<TRequired, THasDefault> {
    return this.refine(
      (v) => v < 0,
      "Number must be negative"
    );
  }

  /** Must be an integer */
  int(): NumberPrimitive<TRequired, THasDefault> {
    return this.refine(
      (v) => globalThis.Number.isInteger(v),
      "Number must be an integer"
    );
  }

  readonly _internal: PrimitiveInternal<number, NumberProxy<TRequired, THasDefault>> = {
    createProxy: (env: ProxyEnvironment.ProxyEnvironment, operationPath: OperationPath.OperationPath): NumberProxy<TRequired, THasDefault> => {
      const defaultValue = this._schema.defaultValue;
      return {
        get: (): MaybeUndefined<number, TRequired, THasDefault> => {
          const state = env.getState(operationPath) as number | undefined;
          return (state ?? defaultValue) as MaybeUndefined<number, TRequired, THasDefault>;
        },
        set: (value: InferSetInput<TRequired, THasDefault>) => {
          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.set, value)
          );
        },
        update: (value: InferUpdateInput<TRequired, THasDefault>) => {
          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.set, value)
          );
        },
        toSnapshot: (): MaybeUndefined<number, TRequired, THasDefault> => {
          const state = env.getState(operationPath) as number | undefined;
          return (state ?? defaultValue) as MaybeUndefined<number, TRequired, THasDefault>;
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

