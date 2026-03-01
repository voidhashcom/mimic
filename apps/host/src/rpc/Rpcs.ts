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

export const UpdateCollectionSchema = Rpc.make("UpdateCollectionSchema", {
  payload: {
    id: Schema.String,
    schemaJson: Schema.Unknown,
  },
  success: Schema.Struct({
    id: Schema.String,
    schemaVersion: Schema.Number,
  }),
  error: Schema.String,
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
    permission: Schema.Union([Schema.Literal("read"), Schema.Literal("write"), Schema.Literal("admin")]),
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

// Document RPCs

const DocumentSnapshotSchema = Schema.Struct({
  id: Schema.String,
  collectionId: Schema.String,
  state: Schema.Unknown,
  version: Schema.Number,
});

export const CreateDocument = Rpc.make("CreateDocument", {
  payload: {
    collectionId: Schema.String,
    id: Schema.optional(Schema.String),
    data: Schema.Unknown,
  },
  success: DocumentSnapshotSchema,
  error: Schema.String,
});

export const GetDocument = Rpc.make("GetDocument", {
  payload: {
    collectionId: Schema.String,
    documentId: Schema.String,
  },
  success: DocumentSnapshotSchema,
  error: Schema.String,
});

export const UpdateDocument = Rpc.make("UpdateDocument", {
  payload: {
    collectionId: Schema.String,
    documentId: Schema.String,
    data: Schema.Unknown,
  },
  success: Schema.Struct({
    id: Schema.String,
    version: Schema.Number,
  }),
  error: Schema.String,
});

export const SetDocument = Rpc.make("SetDocument", {
  payload: {
    collectionId: Schema.String,
    documentId: Schema.String,
    data: Schema.Unknown,
  },
  success: Schema.Struct({
    id: Schema.String,
    version: Schema.Number,
  }),
  error: Schema.String,
});

export const DeleteDocument = Rpc.make("DeleteDocument", {
  payload: {
    collectionId: Schema.String,
    documentId: Schema.String,
  },
  success: Schema.Void,
  error: Schema.String,
});

export const ListDocuments = Rpc.make("ListDocuments", {
  payload: {
    collectionId: Schema.String,
  },
  success: Schema.Array(DocumentSnapshotSchema),
  error: Schema.String,
});
