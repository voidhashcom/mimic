import { Schema } from "effect";
import * as OperationDefinition from "../OperationDefinition";
import * as Operation from "../Operation";
import * as OperationPath from "../OperationPath";
import * as ProxyEnvironment from "../ProxyEnvironment";
import * as Transform from "../Transform";
import type { Primitive, PrimitiveInternal, MaybeUndefined, InferState, NeedsValue } from "./shared";
import { ValidationError } from "./shared";
import { StringPrimitive } from "./String";
import { NumberPrimitive } from "./Number";
import { BooleanPrimitive } from "./Boolean";
import { LiteralPrimitive, LiteralValue } from "./Literal";

// =============================================================================
// Either Primitive - Simple Type Union
// =============================================================================

type InferSetInput<TVariants extends readonly ScalarPrimitive[], TRequired extends boolean = false, THasDefault extends boolean = false> = NeedsValue<InferEitherState<TVariants>, TRequired, THasDefault>
type InferUpdateInput<TVariants extends readonly ScalarPrimitive[], TRequired extends boolean = false, THasDefault extends boolean = false> = NeedsValue<InferEitherState<TVariants>, TRequired, THasDefault>

/**
 * Scalar primitives that can be used as variants in Either
 */
export type ScalarPrimitive =
  | StringPrimitive<any, any>
  | NumberPrimitive<any, any>
  | BooleanPrimitive<any, any>
  | LiteralPrimitive<any, any, any>;

/**
 * Infer the union state type from a tuple of scalar primitives
 */
export type InferEitherState<TVariants extends readonly ScalarPrimitive[]> =
  InferState<TVariants[number]>;

/**
 * Infer the union snapshot type from a tuple of scalar primitives
 */
export type InferEitherSnapshot<TVariants extends readonly ScalarPrimitive[]> =
  InferState<TVariants[number]>;

/**
 * Match handlers for Either - optional handlers for each scalar type
 */
export interface EitherMatchHandlers<R> {
  string?: (value: string) => R;
  number?: (value: number) => R;
  boolean?: (value: boolean) => R;
  literal?: (value: LiteralValue) => R;
}

/**
 * Proxy for accessing Either values
 */
export interface EitherProxy<TVariants extends readonly ScalarPrimitive[], TRequired extends boolean = false, THasDefault extends boolean = false> {
  /** Gets the current value */
  get(): MaybeUndefined<InferEitherState<TVariants>, TRequired, THasDefault>;

  /** Sets the value to any of the allowed variant types */
  set(value: InferSetInput<TVariants, TRequired, THasDefault>): void;

  /** This is the same as set. Updates the value, generating an either.set operation */
  update(value: InferUpdateInput<TVariants, TRequired, THasDefault>): void;

  /** Pattern match on the value type */
  match<R>(handlers: EitherMatchHandlers<R>): R | undefined;

  /** Returns a readonly snapshot of the value for rendering */
  toSnapshot(): MaybeUndefined<InferEitherSnapshot<TVariants>, TRequired, THasDefault>;
}

interface EitherPrimitiveSchema<TVariants extends readonly ScalarPrimitive[]> {
  readonly required: boolean;
  readonly defaultValue: InferEitherState<TVariants> | undefined;
  readonly variants: TVariants;
}

export class EitherPrimitive<TVariants extends readonly ScalarPrimitive[], TRequired extends boolean = false, THasDefault extends boolean = false>
  implements Primitive<InferEitherState<TVariants>, EitherProxy<TVariants, TRequired, THasDefault>, TRequired, THasDefault, InferSetInput<TVariants, TRequired, THasDefault>, InferUpdateInput<TVariants, TRequired, THasDefault>>
{
  readonly _tag = "EitherPrimitive" as const;
  readonly _State!: InferEitherState<TVariants>;
  readonly _Proxy!: EitherProxy<TVariants, TRequired, THasDefault>;
  readonly _TRequired!: TRequired;
  readonly _THasDefault!: THasDefault;
  readonly TUpdateInput!: InferUpdateInput<TVariants, TRequired, THasDefault>;
  readonly TSetInput!: InferSetInput<TVariants, TRequired, THasDefault>;

  private readonly _schema: EitherPrimitiveSchema<TVariants>;

  private readonly _opDefinitions = {
    set: OperationDefinition.make({
      kind: "either.set" as const,
      payload: Schema.Unknown,
      target: Schema.Unknown,
      apply: (payload) => payload,
      deduplicable: true,
    }),
  };

  constructor(schema: EitherPrimitiveSchema<TVariants>) {
    this._schema = schema;
  }

  /** Mark this either as required */
  required(): EitherPrimitive<TVariants, true, THasDefault> {
    return new EitherPrimitive({
      ...this._schema,
      required: true,
    });
  }

  /** Set a default value for this either */
  default(defaultValue: InferEitherState<TVariants>): EitherPrimitive<TVariants, TRequired, true> {
    return new EitherPrimitive({
      ...this._schema,
      defaultValue,
    });
  }

  /** Get the variants */
  get variants(): TVariants {
    return this._schema.variants;
  }

  /**
   * Determine the type category of a value based on the variants
   */
  private _getValueType(value: unknown): "string" | "number" | "boolean" | "literal" | undefined {
    const valueType = typeof value;

    // Check for literal matches first (they take priority)
    for (const variant of this._schema.variants) {
      if (variant._tag === "LiteralPrimitive") {
        const literalVariant = variant as LiteralPrimitive<any, any, any>;
        if (value === literalVariant.literal) {
          return "literal";
        }
      }
    }

    // Check for type matches
    if (valueType === "string") {
      for (const variant of this._schema.variants) {
        if (variant._tag === "StringPrimitive") {
          return "string";
        }
      }
    }

    if (valueType === "number") {
      for (const variant of this._schema.variants) {
        if (variant._tag === "NumberPrimitive") {
          return "number";
        }
      }
    }

    if (valueType === "boolean") {
      for (const variant of this._schema.variants) {
        if (variant._tag === "BooleanPrimitive") {
          return "boolean";
        }
      }
    }

    return undefined;
  }

  /**
   * Find the matching variant for a value.
   * For literals, matches exact value. For other types, matches by typeof.
   */
  private _findMatchingVariant(value: unknown): ScalarPrimitive | undefined {
    const valueType = typeof value;

    // Check for literal matches first (they take priority)
    for (const variant of this._schema.variants) {
      if (variant._tag === "LiteralPrimitive") {
        const literalVariant = variant as LiteralPrimitive<any, any, any>;
        if (value === literalVariant.literal) {
          return variant;
        }
      }
    }

    // Check for type matches
    if (valueType === "string") {
      for (const variant of this._schema.variants) {
        if (variant._tag === "StringPrimitive") {
          return variant;
        }
      }
    }

    if (valueType === "number") {
      for (const variant of this._schema.variants) {
        if (variant._tag === "NumberPrimitive") {
          return variant;
        }
      }
    }

    if (valueType === "boolean") {
      for (const variant of this._schema.variants) {
        if (variant._tag === "BooleanPrimitive") {
          return variant;
        }
      }
    }

    return undefined;
  }

  /**
   * Get the operation kind for a variant
   */
  private _getVariantOperationKind(variant: ScalarPrimitive): string {
    switch (variant._tag) {
      case "StringPrimitive":
        return "string.set";
      case "NumberPrimitive":
        return "number.set";
      case "BooleanPrimitive":
        return "boolean.set";
      case "LiteralPrimitive":
        return "literal.set";
      default:
        return "unknown.set";
    }
  }

  /**
   * Validate a value against the matching variant, including running its validators.
   * Throws ValidationError if the value doesn't match any variant or fails validation.
   */
  private _validateAndApplyToVariant(value: unknown, path: OperationPath.OperationPath): void {
    const matchingVariant = this._findMatchingVariant(value);
    
    if (!matchingVariant) {
      const allowedTypes = this._schema.variants.map((v) => v._tag).join(", ");
      throw new ValidationError(
        `EitherPrimitive.set requires a value matching one of: ${allowedTypes}, got: ${typeof value}`
      );
    }

    // Create a synthetic operation for the variant's applyOperation
    const variantOpKind = this._getVariantOperationKind(matchingVariant);
    const syntheticOp: Operation.Operation<any, any, any> = {
      kind: variantOpKind,
      path: path,
      payload: value,
    };

    // Delegate to the variant's applyOperation which runs its validators
    // This will throw ValidationError if validation fails
    matchingVariant._internal.applyOperation(undefined, syntheticOp);
  }

  readonly _internal: PrimitiveInternal<InferEitherState<TVariants>, EitherProxy<TVariants, TRequired, THasDefault>> = {
    createProxy: (
      env: ProxyEnvironment.ProxyEnvironment,
      operationPath: OperationPath.OperationPath
    ): EitherProxy<TVariants, TRequired, THasDefault> => {
      const defaultValue = this._schema.defaultValue;

      return {
        get: (): MaybeUndefined<InferEitherState<TVariants>, TRequired, THasDefault> => {
          const state = env.getState(operationPath) as InferEitherState<TVariants> | undefined;
          return (state ?? defaultValue) as MaybeUndefined<InferEitherState<TVariants>, TRequired, THasDefault>;
        },
        set: (value: InferSetInput<TVariants, TRequired, THasDefault>) => {
          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.set, value)
          );
        },
        update: (value: InferUpdateInput<TVariants, TRequired, THasDefault>) => {
          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.set, value)
          );
        },
        match: <R,>(handlers: EitherMatchHandlers<R>): R | undefined => {
          const currentState = env.getState(operationPath) as InferEitherState<TVariants> | undefined;
          const effectiveState = currentState ?? defaultValue;
          if (effectiveState === undefined) return undefined;

          const valueType = this._getValueType(effectiveState);
          if (!valueType) return undefined;

          switch (valueType) {
            case "string":
              return handlers.string?.(effectiveState as string);
            case "number":
              return handlers.number?.(effectiveState as number);
            case "boolean":
              return handlers.boolean?.(effectiveState as boolean);
            case "literal":
              return handlers.literal?.(effectiveState as LiteralValue);
            default:
              return undefined;
          }
        },
        toSnapshot: (): MaybeUndefined<InferEitherSnapshot<TVariants>, TRequired, THasDefault> => {
          const state = env.getState(operationPath) as InferEitherState<TVariants> | undefined;
          return (state ?? defaultValue) as MaybeUndefined<InferEitherSnapshot<TVariants>, TRequired, THasDefault>;
        },
      };
    },

    applyOperation: (
      _state: InferEitherState<TVariants> | undefined,
      operation: Operation.Operation<any, any, any>
    ): InferEitherState<TVariants> => {
      if (operation.kind !== "either.set") {
        throw new ValidationError(`EitherPrimitive cannot apply operation of kind: ${operation.kind}`);
      }

      const payload = operation.payload;

      // Validate that the payload matches one of the variant types and passes its validators
      this._validateAndApplyToVariant(payload, operation.path);

      return payload as InferEitherState<TVariants>;
    },

    getInitialState: (): InferEitherState<TVariants> | undefined => {
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

/**
 * Creates a new EitherPrimitive with the given scalar variant types.
 * Validators defined on the variants are applied when validating values.
 *
 * @example
 * ```typescript
 * // String or number
 * const value = Either(String(), Number());
 *
 * // String, number, or boolean
 * const status = Either(String(), Number(), Boolean()).default("pending");
 *
 * // With literal types
 * const mode = Either(Literal("auto"), Literal("manual"), Number());
 *
 * // With validators - validates string length and number range
 * const constrained = Either(
 *   String().min(2).max(50),
 *   Number().max(255)
 * );
 * ```
 */
export function Either<TVariants extends readonly ScalarPrimitive[]>(
  ...variants: TVariants
): EitherPrimitive<TVariants, false, false> {
  if (variants.length === 0) {
    throw new ValidationError("Either requires at least one variant");
  }

  return new EitherPrimitive({
    required: false,
    defaultValue: undefined,
    variants,
  });
}

