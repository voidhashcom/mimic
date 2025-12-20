import { Primitive, ProxyEnvironment, OperationPath } from "@voidhash/mimic";

export const CardNode = Primitive.TreeNode("card", {
    data: Primitive.Struct({
        title: Primitive.String(),
        description: Primitive.String(),
    }),
    children: [],
});

export const ColumnNode = Primitive.TreeNode("column", {
    data: Primitive.Struct({
        name: Primitive.String(),
    }),
    children: [CardNode],
});

export const BoardNode = Primitive.TreeNode("board", {
    data: Primitive.Struct({
        name: Primitive.String(),
    }),
    children: [ColumnNode],
});


export const MimicExampleSchema = Primitive.Tree({
    root: BoardNode,
})
