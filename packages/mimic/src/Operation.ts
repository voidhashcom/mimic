
import * as OperationPath from "./OperationPath"
import * as OperationDefinition from "./OperationDefinition"
import { Schema } from "effect";


export type Operation<TKind, TPayload extends Schema.Schema.Any, TDef extends OperationDefinition.OperationDefinition<TKind, TPayload, any>> = {
    readonly kind: TKind
    readonly path: OperationPath.OperationPath
    readonly payload: Schema.Schema.Type<TPayload>,
    readonly deduplicable?: boolean

} & TDef

export const fromDefinition = <TKind, TPayload extends Schema.Schema.Any, TDef extends OperationDefinition.OperationDefinition<TKind, TPayload, any>>(operationPath: OperationPath.OperationPath, definition: TDef, payload: Schema.Schema.Type<TPayload>): Operation<TKind, TPayload, TDef> => {
    return {
        kind: definition.kind,
        path: operationPath,
        payload: payload,
        ...(definition.deduplicable !== undefined ? { deduplicable: definition.deduplicable } : {}),
    } as Operation<TKind, TPayload, TDef>
}

/**
 * Encoded representation of an Operation for network transport.
 */
export interface EncodedOperation {
    readonly kind: unknown
    readonly path: OperationPath.EncodedOperationPath
    readonly payload: unknown
}

/**
 * Encodes an Operation to a JSON-serializable format for network transport.
 * @param operation - The operation to encode.
 * @returns The encoded representation.
 */
export const encode = <TKind, TPayload extends Schema.Schema.Any, TDef extends OperationDefinition.OperationDefinition<TKind, TPayload, any>>(
    operation: Operation<TKind, TPayload, TDef>
): EncodedOperation => {
    return {
        kind: operation.kind,
        path: OperationPath.encode(operation.path),
        payload: operation.payload,
    }
}

/**
 * Decodes an encoded operation back to an Operation.
 * Note: This returns a partial operation without the definition methods.
 * The caller must have the operation definitions to fully reconstruct if needed.
 * @param encoded - The encoded representation.
 * @returns The decoded Operation (without definition-specific methods).
 */
export const decode = (encoded: EncodedOperation): Operation<unknown, Schema.Schema.Any, any> => {
    return {
        kind: encoded.kind,
        path: OperationPath.decode(encoded.path),
        payload: encoded.payload,
    } as Operation<unknown, Schema.Schema.Any, any>
}