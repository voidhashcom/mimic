import { Schema } from "effect";
import * as OperationDefinition from "../OperationDefinition";
import * as Operation from "../Operation";
import * as OperationPath from "../OperationPath";
import * as ProxyEnvironment from "../ProxyEnvironment";
import * as Transform from "../Transform";
import type { Primitive, PrimitiveInternal, MaybeUndefined, AnyPrimitive, Validator, NeedsValue } from "./shared";
import { ValidationError, runValidators, isCompatibleOperation } from "./shared";


/** Valid literal types */
export type LiteralValue = string | number | boolean | null;

type InferSetInput<T extends LiteralValue, TRequired extends boolean = false, THasDefault extends boolean = false> = NeedsValue<T, TRequired, THasDefault>
type InferUpdateInput<T extends LiteralValue, TRequired extends boolean = false, THasDefault extends boolean = false> = NeedsValue<T, TRequired, THasDefault>

export interface LiteralProxy<T extends LiteralValue, TRequired extends boolean = false, THasDefault extends boolean = false> {
  /** Gets the current literal value */
  get(): MaybeUndefined<T, TRequired, THasDefault>;
  /** Sets the literal value (must match the exact literal type) */
  set(value: InferSetInput<T, TRequired, THasDefault>): void;
  /** This is the same as set. Updates the literal value, generating a literal.set operation */
  update(value: InferUpdateInput<T, TRequired, THasDefault>): void;
  /** Returns a readonly snapshot of the literal value for rendering */
  toSnapshot(): MaybeUndefined<T, TRequired, THasDefault>;
}

interface LiteralPrimitiveSchema<T extends LiteralValue> {
  readonly required: boolean;
  readonly defaultValue: T | undefined;
  readonly literal: T;
}

export class LiteralPrimitive<T extends LiteralValue, TRequired extends boolean = false, THasDefault extends boolean = false> implements Primitive<T, LiteralProxy<T, TRequired, THasDefault>, TRequired, THasDefault, InferSetInput<T, TRequired, THasDefault>, InferUpdateInput<T, TRequired, THasDefault>> {
  readonly _tag = "LiteralPrimitive" as const;
  readonly _State!: T;
  readonly _Proxy!: LiteralProxy<T, TRequired, THasDefault>;
  readonly _TRequired!: TRequired;
  readonly _THasDefault!: THasDefault;
  readonly TUpdateInput!: InferUpdateInput<T, TRequired, THasDefault>;
  readonly TSetInput!: InferSetInput<T, TRequired, THasDefault>;

  private readonly _schema: LiteralPrimitiveSchema<T>;

  private readonly _opDefinitions = {
    set: OperationDefinition.make({
      kind: "literal.set" as const,
      payload: Schema.Unknown,
      target: Schema.Unknown,
      apply: (payload) => payload,
      deduplicable: true,
    }),
  };

  constructor(schema: LiteralPrimitiveSchema<T>) {
    this._schema = schema;
  }

  /** Mark this literal as required */
  required(): LiteralPrimitive<T, true, THasDefault> {
    return new LiteralPrimitive({
      ...this._schema,
      required: true,
    });
  }

  /** Set a default value for this literal */
  default(defaultValue: T): LiteralPrimitive<T, TRequired, true> {
    return new LiteralPrimitive({
      ...this._schema,
      defaultValue,
    });
  }

  /** Get the literal value this primitive represents */
  get literal(): T {
    return this._schema.literal;
  }

  readonly _internal: PrimitiveInternal<T, LiteralProxy<T, TRequired, THasDefault>> = {
    createProxy: (env: ProxyEnvironment.ProxyEnvironment, operationPath: OperationPath.OperationPath): LiteralProxy<T, TRequired, THasDefault> => {
      const defaultValue = this._schema.defaultValue;
      return {
        get: (): MaybeUndefined<T, TRequired, THasDefault> => {
          const state = env.getState(operationPath) as T | undefined;
          return (state ?? defaultValue) as MaybeUndefined<T, TRequired, THasDefault>;
        },
        set: (value: InferSetInput<T, TRequired, THasDefault>) => {
          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.set, value)
          );
        },
        update: (value: InferUpdateInput<T, TRequired, THasDefault>) => {
          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.set, value)
          );
        },
        toSnapshot: (): MaybeUndefined<T, TRequired, THasDefault> => {
          const state = env.getState(operationPath) as T | undefined;
          return (state ?? defaultValue) as MaybeUndefined<T, TRequired, THasDefault>;
        },
      };
    },

    applyOperation: (_state: T | undefined, operation: Operation.Operation<any, any, any>): T => {
      if (operation.kind !== "literal.set") {
        throw new ValidationError(`LiteralPrimitive cannot apply operation of kind: ${operation.kind}`);
      }

      const payload = operation.payload;
      if (payload !== this._schema.literal) {
        throw new ValidationError(
          `LiteralPrimitive.set requires the exact literal value "${globalThis.String(this._schema.literal)}", got: "${globalThis.String(payload)}"`
        );
      }

      return payload as T;
    },

    getInitialState: (): T | undefined => {
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

/** Creates a new LiteralPrimitive with the given literal value */
export const Literal = <T extends LiteralValue>(literal: T): LiteralPrimitive<T, false, false> =>
  new LiteralPrimitive({ required: false, defaultValue: undefined, literal });

