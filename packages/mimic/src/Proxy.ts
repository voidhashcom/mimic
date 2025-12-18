import * as ProxyEnvironment from "./ProxyEnvironment";
import * as OperationPath from "./OperationPath";

export type Proxy<T> = T

export const factory = <T,>(fn: (env: ProxyEnvironment.ProxyEnvironment, operationPath: OperationPath.OperationPath) => Proxy<T>) => {
    return (env: ProxyEnvironment.ProxyEnvironment, operationPath: OperationPath.OperationPath) => fn(env, operationPath)
}