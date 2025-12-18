import { OperationPath } from "./OperationPath"
import * as OperationDefinition from "./OperationDefinition"
import { Schema } from "effect";


export type Operation<TKind, TPayload extends Schema.Schema.Any, TDef extends OperationDefinition.OperationDefinition<TKind, TPayload, any>> = {
    readonly kind: TKind
    readonly path: OperationPath
    readonly payload: Schema.Schema.Type<TPayload>,

} & TDef

export const fromDefinition = <TKind, TPayload extends Schema.Schema.Any, TDef extends OperationDefinition.OperationDefinition<TKind, TPayload, any>>(operationPath: OperationPath, definition: TDef, payload: Schema.Schema.Type<TPayload>): Operation<TKind, TPayload, TDef> => {
    return {
        kind: definition.kind,
        path: operationPath,
        payload: payload,
    } as Operation<TKind, TPayload, TDef>
}