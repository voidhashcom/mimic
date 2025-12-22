import { Effect, Schema } from "effect";
import * as OperationDefinition from "../OperationDefinition";
import * as Operation from "../Operation";
import * as OperationPath from "../OperationPath";
import * as ProxyEnvironment from "../ProxyEnvironment";
import * as Transform from "../Transform";
import type { Primitive, PrimitiveInternal, MaybeUndefined, AnyPrimitive, InferState, InferProxy, InferSnapshot } from "../Primitive";
import { ValidationError } from "../Primitive";
import { LiteralPrimitive } from "./Literal";
import { StructPrimitive, InferStructState } from "./Struct";
import { runValidators, applyDefaults, StructSetInput } from "./shared";


/**
 * Type constraint for union variants - must be struct primitives
 */
export type UnionVariants = Record<string, StructPrimitive<any, any, any>>;

/**
 * Infer the union state type from variants
 */
export type InferUnionState<TVariants extends UnionVariants> = {
  [K in keyof TVariants]: InferState<TVariants[K]>;
}[keyof TVariants];

/**
 * Infer the union snapshot type from variants
 */
export type InferUnionSnapshot<TVariants extends UnionVariants> = {
  [K in keyof TVariants]: InferSnapshot<TVariants[K]>;
}[keyof TVariants];

/**
 * Compute the input type for union.set() operations.
 * For each variant, uses StructSetInput to make fields with defaults optional.
 */
export type UnionSetInput<TVariants extends UnionVariants> = {
  [K in keyof TVariants]: TVariants[K] extends StructPrimitive<infer TFields, any, any>
    ? StructSetInput<TFields>
    : InferState<TVariants[K]>;
}[keyof TVariants];

/**
 * Proxy for accessing union variants
 */
export interface UnionProxy<TVariants extends UnionVariants, _TDiscriminator extends string, TDefined extends boolean = false> {
  /** Gets the current union value */
  get(): MaybeUndefined<InferUnionState<TVariants>, TDefined>;
  
  /** Sets the entire union value (applies defaults for variant fields) */
  set(value: UnionSetInput<TVariants>): void;
  
  /** Access a specific variant's proxy (assumes the variant is active) */
  as<K extends keyof TVariants>(variant: K): InferProxy<TVariants[K]>;
  
  /** Pattern match on the variant type */
  match<R>(handlers: {
    [K in keyof TVariants]: (proxy: InferProxy<TVariants[K]>) => R;
  }): R | undefined;
  
  /** Returns a readonly snapshot of the union for rendering */
  toSnapshot(): MaybeUndefined<InferUnionSnapshot<TVariants>, TDefined>;
}

interface UnionPrimitiveSchema<TVariants extends UnionVariants, TDiscriminator extends string> {
  readonly required: boolean;
  readonly defaultValue: InferUnionState<TVariants> | undefined;
  readonly discriminator: TDiscriminator;
  readonly variants: TVariants;
}

export class UnionPrimitive<TVariants extends UnionVariants, TDiscriminator extends string = "type", TDefined extends boolean = false, THasDefault extends boolean = false>
  implements Primitive<InferUnionState<TVariants>, UnionProxy<TVariants, TDiscriminator, TDefined>, TDefined, THasDefault>
{
  readonly _tag = "UnionPrimitive" as const;
  readonly _State!: InferUnionState<TVariants>;
  readonly _Proxy!: UnionProxy<TVariants, TDiscriminator, TDefined>;
  readonly _TDefined!: TDefined;
  readonly _THasDefault!: THasDefault;

  private readonly _schema: UnionPrimitiveSchema<TVariants, TDiscriminator>;

  private readonly _opDefinitions = {
    set: OperationDefinition.make({
      kind: "union.set" as const,
      payload: Schema.Unknown,
      target: Schema.Unknown,
      apply: (payload) => payload,
    }),
  };

  constructor(schema: UnionPrimitiveSchema<TVariants, TDiscriminator>) {
    this._schema = schema;
  }

  /** Mark this union as required */
  required(): UnionPrimitive<TVariants, TDiscriminator, true, THasDefault> {
    return new UnionPrimitive({
      ...this._schema,
      required: true,
    });
  }

  /** Set a default value for this union */
  default(defaultValue: UnionSetInput<TVariants>): UnionPrimitive<TVariants, TDiscriminator, true, true> {
    // Apply defaults to the variant
    const merged = this._applyVariantDefaults(defaultValue as Partial<InferUnionState<TVariants>>);
    return new UnionPrimitive({
      ...this._schema,
      defaultValue: merged,
    });
  }

  /** Get the discriminator field name */
  get discriminator(): TDiscriminator {
    return this._schema.discriminator;
  }

  /** Get the variants */
  get variants(): TVariants {
    return this._schema.variants;
  }

  /** Find the variant key from a state value */
  private _findVariantKey(state: InferUnionState<TVariants>): keyof TVariants | undefined {
    if (typeof state !== "object" || state === null) {
      return undefined;
    }
    const discriminatorValue = (state as Record<string, unknown>)[this._schema.discriminator];
    
    // Find the variant that matches this discriminator value
    for (const key in this._schema.variants) {
      const variant = this._schema.variants[key]!;
      const discriminatorField = variant.fields[this._schema.discriminator];
      if (discriminatorField && discriminatorField._tag === "LiteralPrimitive") {
        const literalPrimitive = discriminatorField as LiteralPrimitive<any, any, any>;
        if (literalPrimitive.literal === discriminatorValue) {
          return key;
        }
      }
    }
    return undefined;
  }

  /** Apply defaults to a variant value based on the discriminator */
  private _applyVariantDefaults(value: Partial<InferUnionState<TVariants>>): InferUnionState<TVariants> {
    const variantKey = this._findVariantKey(value as InferUnionState<TVariants>);
    if (!variantKey) {
      return value as InferUnionState<TVariants>;
    }
    
    const variantPrimitive = this._schema.variants[variantKey]!;
    return applyDefaults(variantPrimitive as AnyPrimitive, value) as InferUnionState<TVariants>;
  }

  readonly _internal: PrimitiveInternal<InferUnionState<TVariants>, UnionProxy<TVariants, TDiscriminator, TDefined>> = {
    createProxy: (
      env: ProxyEnvironment.ProxyEnvironment,
      operationPath: OperationPath.OperationPath
    ): UnionProxy<TVariants, TDiscriminator, TDefined> => {
      const variants = this._schema.variants;
      const defaultValue = this._schema.defaultValue;

      return {
        get: (): MaybeUndefined<InferUnionState<TVariants>, TDefined> => {
          const state = env.getState(operationPath) as InferUnionState<TVariants> | undefined;
          return (state ?? defaultValue) as MaybeUndefined<InferUnionState<TVariants>, TDefined>;
        },
        set: (value: UnionSetInput<TVariants>) => {
          // Apply defaults for the variant
          const merged = this._applyVariantDefaults(value as Partial<InferUnionState<TVariants>>);
          env.addOperation(
            Operation.fromDefinition(operationPath, this._opDefinitions.set, merged)
          );
        },
        as: <K extends keyof TVariants>(variant: K): InferProxy<TVariants[K]> => {
          const variantPrimitive = variants[variant];
          if (!variantPrimitive) {
            throw new ValidationError(`Unknown variant: ${globalThis.String(variant)}`);
          }
          return variantPrimitive._internal.createProxy(env, operationPath) as InferProxy<TVariants[K]>;
        },
        match: <R,>(handlers: { [K in keyof TVariants]: (proxy: InferProxy<TVariants[K]>) => R }): R | undefined => {
          const state = env.getState(operationPath) as InferUnionState<TVariants> | undefined;
          if (!state) return undefined;
          
          const variantKey = this._findVariantKey(state);
          if (!variantKey) return undefined;
          
          const handler = handlers[variantKey];
          if (!handler) return undefined;
          
          const variantProxy = variants[variantKey]!._internal.createProxy(env, operationPath) as InferProxy<TVariants[typeof variantKey]>;
          return handler(variantProxy);
        },
        toSnapshot: (): MaybeUndefined<InferUnionSnapshot<TVariants>, TDefined> => {
          const state = env.getState(operationPath) as InferUnionState<TVariants> | undefined;
          const effectiveState = state ?? defaultValue;
          if (!effectiveState) {
            return undefined as MaybeUndefined<InferUnionSnapshot<TVariants>, TDefined>;
          }
          
          const variantKey = this._findVariantKey(effectiveState);
          if (!variantKey) {
            return undefined as MaybeUndefined<InferUnionSnapshot<TVariants>, TDefined>;
          }
          
          const variantPrimitive = variants[variantKey]!;
          const variantProxy = variantPrimitive._internal.createProxy(env, operationPath);
          return (variantProxy as unknown as { toSnapshot(): InferUnionSnapshot<TVariants> }).toSnapshot() as MaybeUndefined<InferUnionSnapshot<TVariants>, TDefined>;
        },
      };
    },

    applyOperation: (
      state: InferUnionState<TVariants> | undefined,
      operation: Operation.Operation<any, any, any>
    ): InferUnionState<TVariants> => {
      const path = operation.path;
      const tokens = path.toTokens().filter((t: string) => t !== "");

      // If path is empty, this is a union-level operation
      if (tokens.length === 0) {
        if (operation.kind !== "union.set") {
          throw new ValidationError(`UnionPrimitive root cannot apply operation of kind: ${operation.kind}`);
        }

        const payload = operation.payload;
        if (typeof payload !== "object" || payload === null) {
          throw new ValidationError(`UnionPrimitive.set requires an object payload`);
        }

        // Validate that the discriminator field exists and matches a variant
        const discriminatorValue = (payload as Record<string, unknown>)[this._schema.discriminator];
        if (discriminatorValue === undefined) {
          throw new ValidationError(`UnionPrimitive.set requires a "${this._schema.discriminator}" discriminator field`);
        }

        return payload as InferUnionState<TVariants>;
      }

      // Otherwise, delegate to the active variant
      // We need to determine which variant is active based on current state
      if (state === undefined) {
        throw new ValidationError(`Cannot apply nested operation to undefined union state`);
      }

      const variantKey = this._findVariantKey(state);
      if (variantKey === undefined) {
        throw new ValidationError(`Cannot determine active variant from state`);
      }

      const variantPrimitive = this._schema.variants[variantKey]!;
      const newState = variantPrimitive._internal.applyOperation(
        state as InferState<typeof variantPrimitive>,
        operation
      );

      return newState as InferUnionState<TVariants>;
    },

    getInitialState: (): InferUnionState<TVariants> | undefined => {
      return this._schema.defaultValue;
    },

    transformOperation: (
      clientOp: Operation.Operation<any, any, any>,
      serverOp: Operation.Operation<any, any, any>
    ): Transform.TransformResult => {
      const clientPath = clientOp.path;
      const serverPath = serverOp.path;

      // If paths don't overlap at all, no transformation needed
      if (!OperationPath.pathsOverlap(clientPath, serverPath)) {
        return { type: "transformed", operation: clientOp };
      }

      const clientTokens = clientPath.toTokens().filter((t: string) => t !== "");
      const serverTokens = serverPath.toTokens().filter((t: string) => t !== "");

      // If both are at root level (union.set operations)
      if (clientTokens.length === 0 && serverTokens.length === 0) {
        // Client wins (last-write-wins)
        return { type: "transformed", operation: clientOp };
      }

      // If server set entire union and client is updating a field
      if (serverTokens.length === 0 && serverOp.kind === "union.set") {
        // Client's field operation proceeds - optimistic update
        // Server will validate/reject if needed
        return { type: "transformed", operation: clientOp };
      }

      // If client set entire union and server is updating a field
      if (clientTokens.length === 0 && clientOp.kind === "union.set") {
        // Client's union.set supersedes server's field update
        return { type: "transformed", operation: clientOp };
      }

      // Both operations target fields within the union
      // Since union variants are struct primitives, delegate to the first variant
      // that matches (they all should have the same field structure for the overlapping field)
      if (clientTokens.length > 0 && serverTokens.length > 0) {
        const clientField = clientTokens[0];
        const serverField = serverTokens[0];

        // Different fields - no conflict
        if (clientField !== serverField) {
          return { type: "transformed", operation: clientOp };
        }

        // Same field - delegate to a variant (use first variant as they share structure)
        const variantKeys = Object.keys(this._schema.variants);
        if (variantKeys.length === 0) {
          return { type: "transformed", operation: clientOp };
        }

        const firstVariant = this._schema.variants[variantKeys[0]!]!;
        const result = firstVariant._internal.transformOperation(clientOp, serverOp);

        return result;
      }

      // Default: no transformation needed
      return { type: "transformed", operation: clientOp };
    },
  };
}

/** Options for creating a Union primitive */
export interface UnionOptions<TVariants extends UnionVariants, TDiscriminator extends string> {
  /** The field name used to discriminate between variants (defaults to "type") */
  readonly discriminator?: TDiscriminator;
  /** The variant struct primitives */
  readonly variants: TVariants;
}

/** Creates a new UnionPrimitive with the given variants */
export function Union<TVariants extends UnionVariants>(
  options: UnionOptions<TVariants, "type">
): UnionPrimitive<TVariants, "type", false, false>;
export function Union<TVariants extends UnionVariants, TDiscriminator extends string>(
  options: UnionOptions<TVariants, TDiscriminator>
): UnionPrimitive<TVariants, TDiscriminator, false, false>;
export function Union<TVariants extends UnionVariants, TDiscriminator extends string = "type">(
  options: UnionOptions<TVariants, TDiscriminator>
): UnionPrimitive<TVariants, TDiscriminator, false, false> {
  const discriminator = (options.discriminator ?? "type") as TDiscriminator;
  return new UnionPrimitive({
    required: false,
    defaultValue: undefined,
    discriminator,
    variants: options.variants,
  });
}

