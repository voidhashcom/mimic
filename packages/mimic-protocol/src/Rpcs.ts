import { Schema } from "effect";
import { Rpc, RpcGroup } from "effect/unstable/rpc";
import { AuthMiddleware } from "./middleware.js";

// Database RPCs

export const CreateDatabase = Rpc.make("CreateDatabase", {
  payload: {
    name: Schema.String,
    description: Schema.String,
  },
  success: Schema.Struct({
    id: Schema.String,
    name: Schema.String,
    description: Schema.String,
  }),
  error: Schema.String,
});

export const ListDatabases = Rpc.make("ListDatabases", {
  success: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      name: Schema.String,
      description: Schema.String,
    }),
  ),
  error: Schema.String,
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
    schemaJson: Schema.Any,
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
  error: Schema.String,
});

export const UpdateCollectionSchema = Rpc.make("UpdateCollectionSchema", {
  payload: {
    id: Schema.String,
    schemaJson: Schema.Any,
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

// User RPCs

export const CreateUser = Rpc.make("CreateUser", {
  payload: {
    username: Schema.String,
    password: Schema.String,
  },
  success: Schema.Struct({
    id: Schema.String,
    username: Schema.String,
  }),
  error: Schema.String,
});

export const ListUsers = Rpc.make("ListUsers", {
  success: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      username: Schema.String,
      isSuperuser: Schema.Boolean,
    }),
  ),
  error: Schema.String,
});

export const DeleteUser = Rpc.make("DeleteUser", {
  payload: { id: Schema.String },
  success: Schema.Void,
  error: Schema.String,
});

export const GrantPermission = Rpc.make("GrantPermission", {
  payload: {
    userId: Schema.String,
    databaseId: Schema.String,
    permission: Schema.Union([Schema.Literal("read"), Schema.Literal("write"), Schema.Literal("admin")]),
  },
  success: Schema.Void,
  error: Schema.String,
});

export const RevokePermission = Rpc.make("RevokePermission", {
  payload: {
    userId: Schema.String,
    databaseId: Schema.String,
  },
  success: Schema.Void,
  error: Schema.String,
});

export const ListGrants = Rpc.make("ListGrants", {
  payload: {
    userId: Schema.optional(Schema.String),
  },
  success: Schema.Array(
    Schema.Struct({
      id: Schema.String,
      userId: Schema.String,
      databaseId: Schema.String,
      permission: Schema.String,
    }),
  ),
  error: Schema.String,
});

// Document Token RPCs

export const CreateDocumentToken = Rpc.make("CreateDocumentToken", {
  payload: {
    collectionId: Schema.String,
    documentId: Schema.String,
    permission: Schema.Union([Schema.Literal("read"), Schema.Literal("write")]),
    expiresInSeconds: Schema.optional(Schema.Number),
  },
  success: Schema.Struct({
    token: Schema.String,
  }),
  error: Schema.String,
});

// Document RPCs

const DocumentSnapshotSchema = Schema.Struct({
  id: Schema.String,
  collectionId: Schema.String,
  state: Schema.Any,
  version: Schema.Number,
});

export const CreateDocument = Rpc.make("CreateDocument", {
  payload: {
    collectionId: Schema.String,
    id: Schema.optional(Schema.String),
    data: Schema.Any,
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
    data: Schema.Any,
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
    data: Schema.Any,
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

// RPC Group

export const MimicRpcs = RpcGroup.make(
  CreateDatabase,
  ListDatabases,
  DeleteDatabase,
  CreateCollection,
  ListCollections,
  UpdateCollectionSchema,
  DeleteCollection,
  CreateUser,
  ListUsers,
  DeleteUser,
  GrantPermission,
  RevokePermission,
  ListGrants,
  CreateDocumentToken,
  CreateDocument,
  GetDocument,
  UpdateDocument,
  SetDocument,
  DeleteDocument,
  ListDocuments,
).middleware(AuthMiddleware);
