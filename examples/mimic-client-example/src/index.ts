import { Primitive } from "@voidhash/mimic"

const flexNode = Primitive.Struct({
    name: Primitive.Literal("flexNode"),
    children: Primitive.Array(Primitive.Lazy(() => flexNode)),
})


const proxy = flexNode._internal.createProxy(ProxyEnvironment.make(), OperationPath.make(""))