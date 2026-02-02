import { Schema } from "effect";

type Mutable<T> = T extends ReadonlyArray<infer U> ? Array<U> : { -readonly [K in keyof T]: T[K] };

export interface OperationDefinition<TKind, TPayload extends Schema.Schema.Any, TTarget extends Schema.Schema.Any> {
    readonly kind: TKind
    readonly payload: TPayload
    readonly target: TTarget
    readonly deduplicable?: boolean
}

export const make = <TKind, TPayload extends Schema.Schema.Any, TTarget extends Schema.Schema.Any>(options: {
    readonly kind: TKind
    readonly payload: TPayload
    readonly target: TTarget
    readonly apply: (payload: Schema.Schema.Type<TPayload>, target: Mutable<Schema.Schema.Type<TTarget>>) => void
    readonly deduplicable?: boolean
}) => {
    return {
        kind: options.kind,
        payload: options.payload,
        target: options.target,
        apply: options.apply,
        ...(options.deduplicable !== undefined ? { deduplicable: options.deduplicable } : {}),
    } as const;
}