import { Schema } from "effect";
import * as OperationDefinition from "../OperationDefinition";
import * as Operation from "../Operation";
import * as OperationPath from "../OperationPath";
import * as ProxyEnvironment from "../ProxyEnvironment";
import * as Transform from "../Transform";
import type { Primitive, PrimitiveInternal, MaybeUndefined, Validator } from "./shared";
import { runValidators, isCompatibleOperation, ValidationError } from "./shared";


export interface BooleanProxy<TDefined extends boolean = false> {
  /** Gets the current boolean value */
  get(): MaybeUndefined<boolean, TDefined>;
  /** Sets the boolean value, generating a boolean.set operation */
  set(value: boolean): void;
  /** Returns a readonly snapshot of the boolean value for rendering */
  toSnapshot(): MaybeUndefined<boolean, TDefined>;
}

interface BooleanPrimitiveSchema {
  readonly required: boolean;
  readonly defaultValue: boolean | undefined;
  readonly validators: readonly Validator<boolean>[];
}

export class BooleanPrimitive<TDefined extends boolean = false> implements Primitive<boolean, BooleanProxy<TDefined>> {
  readonly _tag = "BooleanPrimitive" as const;
  readonly _State!: boolean;
  readonly _Proxy!: BooleanProxy<TDefined>;

  private readonly _schema: BooleanPrimitiveSchema;

  private readonly _opDefinitions = {
    set: OperationDefinition.make({
      kind: "boolean.set" as const,
      payload: Schema.Boolean,
      target: Schema.Boolean,
      apply: (payload) => payload,
    }),
  };

  constructor(schema: BooleanPrimitiveSchema) {
    this._schema = schema;
  }

  /** Mark this boolean as required */
  required(): BooleanPrimitive<true> {
    return new BooleanPrimitive({
      ...this._schema,
      required: true,
    });
  }

  /** Set a default value for this boolean */
  default(defaultValue: boolean): BooleanPrimitive<true> {
    return new BooleanPrimitive({
      ...this._schema,
      defaultValue,
    });
  }

  /** Add a custom validation rule */
  refine(fn: (value: boolean) => boolean, message: string): BooleanPrimitive<TDefined> {
    return new BooleanPrimitive({
      ...this._schema,
      validators: [...this._schema.validators, { validate: fn, message }],
    });
  }

  readonly _internal: PrimitiveInternal<boolean, BooleanProxy<TDefined>> = {
    createProxy: (env: ProxyEnvironment.ProxyEnvironment, operationPath: OperationPath.OperationPath): BooleanProxy<TDefined> => {
      const defaultValue = this._schema.defaultValue;
      return {
        get: (): MaybeUndefined<boolean, TDefined> => {
          const state = env.getState(operationPath) as boolean | undefined;
          return (state ?? defaultValue) as MaybeUndefined<boolean, TDefined>;
        },
        set: (value: boolean) => {
          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.set, value)
          );
        },
        toSnapshot: (): MaybeUndefined<boolean, TDefined> => {
          const state = env.getState(operationPath) as boolean | undefined;
          return (state ?? defaultValue) as MaybeUndefined<boolean, TDefined>;
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
export const Boolean = (): BooleanPrimitive<false> =>
  new BooleanPrimitive({ required: false, defaultValue: undefined, validators: [] });

