import { Schema } from "effect";
import * as OperationDefinition from "../OperationDefinition";
import * as Operation from "../Operation";
import * as OperationPath from "../OperationPath";
import * as ProxyEnvironment from "../ProxyEnvironment";
import * as Transform from "../Transform";
import type { Primitive, PrimitiveInternal, MaybeUndefined, Validator } from "./shared";
import { runValidators, isCompatibleOperation, ValidationError } from "./shared";

// =============================================================================
// String Primitive
// =============================================================================

export interface StringProxy<TDefined extends boolean = false> {
  /** Gets the current string value */
  get(): MaybeUndefined<string, TDefined>;
  /** Sets the string value, generating a string.set operation */
  set(value: string): void;
  /** Returns a readonly snapshot of the string value for rendering */
  toSnapshot(): MaybeUndefined<string, TDefined>;
}

interface StringPrimitiveSchema {
  readonly required: boolean;
  readonly defaultValue: string | undefined;
  readonly validators: readonly Validator<string>[];
}

export class StringPrimitive<TDefined extends boolean = false, THasDefault extends boolean = false> implements Primitive<string, StringProxy<TDefined>, TDefined, THasDefault> {
  readonly _tag = "StringPrimitive" as const;
  readonly _State!: string;
  readonly _Proxy!: StringProxy<TDefined>;
  readonly _TDefined!: TDefined;
  readonly _THasDefault!: THasDefault;

  private readonly _schema: StringPrimitiveSchema;

  private readonly _opDefinitions = {
    set: OperationDefinition.make({
      kind: "string.set" as const,
      payload: Schema.String,
      target: Schema.String,
      apply: (payload) => payload,
    }),
  };

  constructor(schema: StringPrimitiveSchema) {
    this._schema = schema;
  }

  /** Mark this string as required */
  required(): StringPrimitive<true, THasDefault> {
    return new StringPrimitive({
      ...this._schema,
      required: true,
    });
  }

  /** Set a default value for this string */
  default(defaultValue: string): StringPrimitive<true, true> {
    return new StringPrimitive({
      ...this._schema,
      defaultValue,
    });
  }

  /** Add a custom validation rule */
  refine(fn: (value: string) => boolean, message: string): StringPrimitive<TDefined, THasDefault> {
    return new StringPrimitive({
      ...this._schema,
      validators: [...this._schema.validators, { validate: fn, message }],
    });
  }

  /** Minimum string length */
  min(length: number): StringPrimitive<TDefined, THasDefault> {
    return this.refine(
      (v) => v.length >= length,
      `String must be at least ${length} characters`
    );
  }

  /** Maximum string length */
  max(length: number): StringPrimitive<TDefined, THasDefault> {
    return this.refine(
      (v) => v.length <= length,
      `String must be at most ${length} characters`
    );
  }

  /** Exact string length */
  length(exact: number): StringPrimitive<TDefined, THasDefault> {
    return this.refine(
      (v) => v.length === exact,
      `String must be exactly ${exact} characters`
    );
  }

  /** Match a regex pattern */
  regex(pattern: RegExp, message?: string): StringPrimitive<TDefined, THasDefault> {
    return this.refine(
      (v) => pattern.test(v),
      message ?? `String must match pattern ${pattern}`
    );
  }

  /** Validate as email format */
  email(): StringPrimitive<TDefined, THasDefault> {
    // Simple email regex - covers most common cases
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return this.refine(
      (v) => emailPattern.test(v),
      "Invalid email format"
    );
  }

  /** Validate as URL format */
  url(): StringPrimitive<TDefined, THasDefault> {
    return this.refine(
      (v) => {
        try {
          new URL(v);
          return true;
        } catch {
          return false;
        }
      },
      "Invalid URL format"
    );
  }

  readonly _internal: PrimitiveInternal<string, StringProxy<TDefined>> = {
    createProxy: (env: ProxyEnvironment.ProxyEnvironment, operationPath: OperationPath.OperationPath): StringProxy<TDefined> => {
      const defaultValue = this._schema.defaultValue;
      return {
        get: (): MaybeUndefined<string, TDefined> => {
          const state = env.getState(operationPath) as string | undefined;
          return (state ?? defaultValue) as MaybeUndefined<string, TDefined>;
        },
        set: (value: string) => {
          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.set, value)
          );
        },
        toSnapshot: (): MaybeUndefined<string, TDefined> => {
          const state = env.getState(operationPath) as string | undefined;
          return (state ?? defaultValue) as MaybeUndefined<string, TDefined>;
        },
      };
    },

    applyOperation: (_state: string | undefined, operation: Operation.Operation<any, any, any>): string => {
      if (!isCompatibleOperation(operation, this._opDefinitions)) {
        throw new ValidationError(`StringPrimitive cannot apply operation of kind: ${operation.kind}`);
      }

      const payload = operation.payload;
      if (typeof payload !== "string") {
        throw new ValidationError(`StringPrimitive.set requires a string payload, got: ${typeof payload}`);
      }

      // Run validators
      runValidators(payload, this._schema.validators);

      return payload;
    },

    getInitialState: (): string | undefined => {
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
      // Client operation proceeds as-is
      return { type: "transformed", operation: clientOp };
    },
  };
}

/** Creates a new StringPrimitive */
export const String = (): StringPrimitive<false, false> =>
  new StringPrimitive({ required: false, defaultValue: undefined, validators: [] });

