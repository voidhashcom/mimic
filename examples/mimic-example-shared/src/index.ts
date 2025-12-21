import { Primitive, ProxyEnvironment, OperationPath, Presence } from "@voidhash/mimic";
import { Schema } from "effect";

export const CardNode = Primitive.TreeNode("card", {
    data: Primitive.Struct({
        title: Primitive.String().min(1).max(34),
        description: Primitive.String(),
    }),
    children: [],
});

export const ColumnNode = Primitive.TreeNode("column", {
    data: Primitive.Struct({
        name: Primitive.String().min(1).max(34),
    }),
    children: [CardNode],
});

export const BoardNode = Primitive.TreeNode("board", {
    data: Primitive.Struct({
        name: Primitive.String().default("My Board").min(1).max(34),
    }),
    children: [ColumnNode],
});


export const MimicExampleSchema = Primitive.Tree({
    root: BoardNode,
})

export const PresenceSchema = Presence.make({
    schema: Schema.Struct({
        name: Schema.optional(Schema.String),
    }),
});