import { Schema } from "effect";
import { Rpc } from "effect/unstable/rpc";

// Database RPCs

export const CreateDatabase = Rpc.make("CreateDatabase", {
  payload: {
    name: Schema.String,
    description: Schema.optional(Schema.String),
  },
  success: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    description: Schema.NullOr(Schema.String),
  }),
  error: Schema.String,
});

export const ListDatabases = Rpc.make("ListDatabases", {
  success: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      description: Schema.NullOr(Schema.String),
    }),
  ),
});

export const DeleteDatabase = Rpc.make("DeleteDatabase", {
  payload: { id: Schema.String },
  success: Schema.Void,
  error: Schema.String,
});

// Collection RPCs

export const CreateCollection = Rpc.make("CreateCollection", {
  payload: {
    databaseId: Schema.String,
    name: Schema.String,
    schemaJson: Schema.Unknown,
  },
  success: Schema.Struct({
    id: Schema.String,
    databaseId: Schema.String,
    name: Schema.String,
  }),
  error: Schema.String,
});

export const ListCollections = Rpc.make("ListCollections", {
  payload: { databaseId: Schema.String },
  success: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      databaseId: Schema.String,
      name: Schema.String,
    }),
  ),
});

export const DeleteCollection = Rpc.make("DeleteCollection", {
  payload: { id: Schema.String },
  success: Schema.Void,
  error: Schema.String,
});

// Credential RPCs

export const CreateCredential = Rpc.make("CreateCredential", {
  payload: {
    databaseId: Schema.String,
    label: Schema.String,
    permission: Schema.Union([Schema.Literal("read"), Schema.Literal("write")]),
  },
  success: Schema.Struct({
    id: Schema.String,
    token: Schema.String,
  }),
  error: Schema.String,
});

export const ListCredentials = Rpc.make("ListCredentials", {
  payload: { databaseId: Schema.String },
  success: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      label: Schema.String,
      permission: Schema.String,
    }),
  ),
});

export const DeleteCredential = Rpc.make("DeleteCredential", {
  payload: { id: Schema.String },
  success: Schema.Void,
});
