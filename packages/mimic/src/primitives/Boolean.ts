import { Schema } from "effect";
import * as OperationDefinition from "../OperationDefinition";
import * as Operation from "../Operation";
import * as OperationPath from "../OperationPath";
import * as ProxyEnvironment from "../ProxyEnvironment";
import * as Transform from "../Transform";
import type { Primitive, PrimitiveInternal, MaybeUndefined, Validator, NeedsValue } from "./shared";
import { runValidators, isCompatibleOperation, ValidationError } from "./shared";


type InferSetInput<TRequired extends boolean = false, THasDefault extends boolean = false> = NeedsValue<boolean, TRequired, THasDefault>
type InferUpdateInput<TRequired extends boolean = false, THasDefault extends boolean = false> = NeedsValue<boolean, TRequired, THasDefault>

export interface BooleanProxy<TRequired extends boolean = false, THasDefault extends boolean = false> {
  /** Gets the current boolean value */
  get(): MaybeUndefined<boolean, TRequired, THasDefault>;
  /** Sets the boolean value, generating a boolean.set operation */
  set(value: InferSetInput<TRequired, THasDefault>): void;
  /** This is the same as set. Updates the boolean value, generating a boolean.set operation */
  update(value: InferUpdateInput<TRequired, THasDefault>): void;
  /** Returns a readonly snapshot of the boolean value for rendering */
  toSnapshot(): MaybeUndefined<boolean, TRequired, THasDefault>;
}

interface BooleanPrimitiveSchema {
  readonly required: boolean;
  readonly defaultValue: boolean | undefined;
  readonly validators: readonly Validator<boolean>[];
}

export class BooleanPrimitive<TRequired extends boolean = false, THasDefault extends boolean = false> implements Primitive<boolean, BooleanProxy<TRequired, THasDefault>, TRequired, THasDefault, InferSetInput<TRequired, THasDefault>, InferUpdateInput<TRequired, THasDefault>> {
  readonly _tag = "BooleanPrimitive" as const;
  readonly _State!: boolean;
  readonly _Proxy!: BooleanProxy<TRequired, THasDefault>;
  readonly _TRequired!: TRequired;
  readonly _THasDefault!: THasDefault;
  readonly TUpdateInput!: InferUpdateInput<TRequired, THasDefault>;
  readonly TSetInput!: InferSetInput<TRequired, THasDefault>;

  private readonly _schema: BooleanPrimitiveSchema;

  private readonly _opDefinitions = {
    set: OperationDefinition.make({
      kind: "boolean.set" as const,
      payload: Schema.Boolean,
      target: Schema.Boolean,
      apply: (payload) => payload,
      deduplicable: true,
    }),
  };

  constructor(schema: BooleanPrimitiveSchema) {
    this._schema = schema;
  }

  /** Mark this boolean as required */
  required(): BooleanPrimitive<true, THasDefault> {
    return new BooleanPrimitive({
      ...this._schema,
      required: true,
    });
  }

  /** Set a default value for this boolean */
  default(defaultValue: boolean): BooleanPrimitive<TRequired, true> {
    return new BooleanPrimitive({
      ...this._schema,
      defaultValue,
    });
  }

  /** Add a custom validation rule */
  refine(fn: (value: boolean) => boolean, message: string): BooleanPrimitive<TRequired, THasDefault> {
    return new BooleanPrimitive({
      ...this._schema,
      validators: [...this._schema.validators, { validate: fn, message }],
    });
  }

  readonly _internal: PrimitiveInternal<boolean, BooleanProxy<TRequired, THasDefault>> = {
    createProxy: (env: ProxyEnvironment.ProxyEnvironment, operationPath: OperationPath.OperationPath): BooleanProxy<TRequired, THasDefault> => {
      const defaultValue = this._schema.defaultValue;
      return {
        get: (): MaybeUndefined<boolean, TRequired, THasDefault> => {
          const state = env.getState(operationPath) as boolean | undefined;
          return (state ?? defaultValue) as MaybeUndefined<boolean, TRequired, THasDefault>;
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
        toSnapshot: (): MaybeUndefined<boolean, TRequired, THasDefault> => {
          const state = env.getState(operationPath) as boolean | undefined;
          return (state ?? defaultValue) as MaybeUndefined<boolean, TRequired, THasDefault>;
        },
      };
    },

    applyOperation: (_state: boolean | undefined, operation: Operation.Operation<any, any, any>): boolean => {
      if (operation.kind !== "boolean.set") {
        throw new ValidationError(`BooleanPrimitive cannot apply operation of kind: ${operation.kind}`);
      }

      const payload = operation.payload;
      if (typeof payload !== "boolean") {
        throw new ValidationError(`BooleanPrimitive.set requires a boolean payload, got: ${typeof payload}`);
      }

      // Run validators
      runValidators(payload, this._schema.validators);

      return payload;
    },

    getInitialState: (): boolean | undefined => {
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

/** Creates a new BooleanPrimitive */
export const Boolean = (): BooleanPrimitive<false, false> =>
  new BooleanPrimitive({ required: false, defaultValue: undefined, validators: [] });

