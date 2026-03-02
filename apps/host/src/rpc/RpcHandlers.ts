import { Effect } from "effect";
import { Document, Transaction, SchemaJSON, type Primitive } from "@voidhash/mimic";
import { MimicRpcs, CurrentUser } from "@voidhash/mimic-protocol";
import { DatabaseServiceTag } from "../services/DatabaseService";
import { CollectionServiceTag } from "../services/CollectionService";
import { UserServiceTag } from "../services/UserService";
import { DocumentTokenServiceTag } from "../services/DocumentTokenService";
import { DocumentGatewayTag } from "../engine/DocumentGateway";
import { DocumentRepositoryTag } from "../mysql/DocumentRepository";

const mapServiceError = (e: { _tag: string; [key: string]: any }): string => {
  switch (e._tag) {
    case "DatabaseAlreadyExistsError":
      return `Database '${e.name}' already exists`;
    case "DatabaseNotFoundError":
      return `Database not found: ${e.databaseId}`;
    case "CollectionAlreadyExistsError":
      return `Collection '${e.name}' already exists`;
    case "CollectionNotFoundError":
      return `Collection not found: ${e.collectionId}`;
    case "DocumentNotFoundError":
      return `Document not found: ${e.documentId}`;
    case "UserAlreadyExistsError":
      return `User '${e.username}' already exists`;
    case "UserNotFoundError":
      return `User not found: ${e.userId}`;
    case "GrantNotFoundError":
      return `Grant not found for user ${e.userId} on database ${e.databaseId}`;
    case "DatabaseServiceError":
    case "CollectionServiceError":
    case "UserServiceError":
      return `Internal error: ${e.message}`;
    default:
      return String(e);
  }
};

const requireSuperuser = (user: { isSuperuser: boolean }, method: string) => {
  if (!user.isSuperuser) {
    return Effect.fail(`Superuser permission required for ${method}`);
  }
  return Effect.void;
};

const WRITE_METHODS = new Set(["CreateDocument", "UpdateDocument", "SetDocument", "DeleteDocument", "CreateDocumentToken"]);
const ADMIN_METHODS = new Set(["CreateCollection", "DeleteCollection", "UpdateCollectionSchema"]);

const checkDatabasePermission = (
  user: { userId: string; isSuperuser: boolean },
  databaseId: string,
  method: string,
) =>
  Effect.gen(function* () {
    if (user.isSuperuser) return;

    const userService = yield* UserServiceTag;
    const grant = yield* userService.getUserPermissionForDatabase(user.userId, databaseId).pipe(
      Effect.mapError(mapServiceError),
    );
    if (!grant) {
      return yield* Effect.fail(`No permission on database ${databaseId}`);
    }
    if (ADMIN_METHODS.has(method) && grant.permission !== "admin") {
      return yield* Effect.fail(`Admin permission required for ${method}`);
    }
    if (WRITE_METHODS.has(method) && grant.permission === "read") {
      return yield* Effect.fail(`Write permission required for ${method}`);
    }
  });

const resolveDatabaseId = (payload: { databaseId?: string; collectionId?: string }) =>
  Effect.gen(function* () {
    if (payload.databaseId) return payload.databaseId;
    if (payload.collectionId) {
      const collectionService = yield* CollectionServiceTag;
      const collection = yield* collectionService.getById(payload.collectionId).pipe(
        Effect.mapError(mapServiceError),
      );
      return collection.databaseId;
    }
    return undefined;
  });

export const RpcHandlersLive = MimicRpcs.toLayer(
  Effect.gen(function* () {
    const dbService = yield* DatabaseServiceTag;
    const collectionService = yield* CollectionServiceTag;
    const userService = yield* UserServiceTag;
    const documentTokenService = yield* DocumentTokenServiceTag;
    const gateway = yield* DocumentGatewayTag;
    const docRepo = yield* DocumentRepositoryTag;

    return {
      CreateDatabase: (payload) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          yield* requireSuperuser(user, "CreateDatabase");
          const db = yield* dbService.create(payload.name, payload.description).pipe(
            Effect.mapError(mapServiceError),
          );
          return { id: db.id, name: db.name, description: db.description };
        }),

      ListDatabases: () =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          yield* requireSuperuser(user, "ListDatabases");
          const dbs = yield* dbService.list().pipe(Effect.mapError(mapServiceError));
          return dbs.map((db) => ({ id: db.id, name: db.name, description: db.description }));
        }),

      DeleteDatabase: (payload) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          yield* requireSuperuser(user, "DeleteDatabase");
          yield* dbService.remove(payload.id).pipe(Effect.mapError(mapServiceError));
        }),

      CreateCollection: (payload) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          yield* checkDatabasePermission(user, payload.databaseId, "CreateCollection");
          const collection = yield* collectionService
            .create(payload.databaseId, payload.name, payload.schemaJson)
            .pipe(Effect.mapError(mapServiceError));
          return { id: collection.id, databaseId: collection.databaseId, name: collection.name };
        }),

      ListCollections: (payload) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          yield* checkDatabasePermission(user, payload.databaseId, "ListCollections");
          const collections = yield* collectionService.listByDatabase(payload.databaseId).pipe(
            Effect.mapError(mapServiceError),
          );
          return collections.map((c) => ({ id: c.id, databaseId: c.databaseId, name: c.name }));
        }),

      UpdateCollectionSchema: (payload) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          const databaseId = yield* resolveDatabaseId({ collectionId: payload.id });
          if (databaseId) yield* checkDatabasePermission(user, databaseId, "UpdateCollectionSchema");
          const updated = yield* collectionService
            .updateSchema(payload.id, payload.schemaJson)
            .pipe(Effect.mapError(mapServiceError));
          return { id: updated.id, schemaVersion: updated.schemaVersion };
        }),

      DeleteCollection: (payload) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          const databaseId = yield* resolveDatabaseId({ collectionId: payload.id });
          if (databaseId) yield* checkDatabasePermission(user, databaseId, "DeleteCollection");
          yield* collectionService.remove(payload.id).pipe(Effect.mapError(mapServiceError));
        }),

      CreateUser: (payload) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          yield* requireSuperuser(user, "CreateUser");
          const created = yield* userService.createUser(payload.username, payload.password).pipe(
            Effect.mapError(mapServiceError),
          );
          return { id: created.id, username: created.username };
        }),

      ListUsers: () =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          yield* requireSuperuser(user, "ListUsers");
          const users = yield* userService.listUsers().pipe(Effect.mapError(mapServiceError));
          return users.map((u) => ({ id: u.id, username: u.username, isSuperuser: u.isSuperuser }));
        }),

      DeleteUser: (payload) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          yield* requireSuperuser(user, "DeleteUser");
          yield* userService.deleteUser(payload.id).pipe(Effect.mapError(mapServiceError));
        }),

      GrantPermission: (payload) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          yield* requireSuperuser(user, "GrantPermission");
          yield* userService
            .grantPermission(payload.userId, payload.databaseId, payload.permission)
            .pipe(Effect.mapError(mapServiceError));
        }),

      RevokePermission: (payload) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          yield* requireSuperuser(user, "RevokePermission");
          yield* userService
            .revokePermission(payload.userId, payload.databaseId)
            .pipe(Effect.mapError(mapServiceError));
        }),

      ListGrants: (payload) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          const userId = user.isSuperuser ? payload.userId : user.userId;
          const grants = yield* userService.listGrants(userId).pipe(
            Effect.mapError(mapServiceError),
          );
          return grants.map((g) => ({
            id: g.id,
            userId: g.userId,
            databaseId: g.databaseId,
            permission: g.permission,
          }));
        }),

      CreateDocumentToken: (payload) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          const databaseId = yield* resolveDatabaseId({ collectionId: payload.collectionId });
          if (databaseId) yield* checkDatabasePermission(user, databaseId, "CreateDocumentToken");
          const result = yield* documentTokenService
            .createToken(payload.collectionId, payload.documentId, payload.permission, payload.expiresInSeconds)
            .pipe(Effect.mapError(mapServiceError));
          return { token: result.token };
        }),

      CreateDocument: (payload) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          const databaseId = yield* resolveDatabaseId({ collectionId: payload.collectionId });
          if (databaseId) yield* checkDatabasePermission(user, databaseId, "CreateDocument");

          const collection = yield* collectionService.getById(payload.collectionId).pipe(
            Effect.mapError(mapServiceError),
          );
          const schema = SchemaJSON.fromJSON(collection.schemaJson) as Primitive.AnyPrimitive;
          const documentId = payload.id ?? crypto.randomUUID();

          const doc = Document.make(schema, { initial: payload.data });
          doc.transaction((root: any) => {
            root.set(payload.data);
          });
          const tx = doc.flush();

          yield* docRepo.create(documentId, payload.collectionId).pipe(
            Effect.mapError((cause) => `Failed to create document: ${cause}`),
          );

          if (!Transaction.isEmpty(tx)) {
            yield* gateway.submit(payload.collectionId, documentId, tx).pipe(
              Effect.mapError((cause) => `Failed to submit document transaction: ${cause}`),
            );
          }

          const snapshot = yield* gateway.getSnapshot(payload.collectionId, documentId).pipe(
            Effect.mapError((cause) => `Failed to get document snapshot: ${cause}`),
          );

          return {
            id: documentId,
            collectionId: payload.collectionId,
            state: snapshot.state,
            version: snapshot.version,
          };
        }),

      GetDocument: (payload) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          const databaseId = yield* resolveDatabaseId({ collectionId: payload.collectionId });
          if (databaseId) yield* checkDatabasePermission(user, databaseId, "GetDocument");

          const doc = yield* docRepo.findById(payload.documentId).pipe(
            Effect.mapError((cause) => `Failed to find document: ${cause}`),
          );
          if (!doc || doc.deletedAt) {
            return yield* Effect.fail(`Document not found: ${payload.documentId}`);
          }

          const snapshot = yield* gateway.getSnapshot(payload.collectionId, payload.documentId).pipe(
            Effect.mapError((cause) => `Failed to get document snapshot: ${cause}`),
          );

          return {
            id: payload.documentId,
            collectionId: payload.collectionId,
            state: snapshot.state,
            version: snapshot.version,
          };
        }),

      UpdateDocument: (payload) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          const databaseId = yield* resolveDatabaseId({ collectionId: payload.collectionId });
          if (databaseId) yield* checkDatabasePermission(user, databaseId, "UpdateDocument");

          const doc = yield* docRepo.findById(payload.documentId).pipe(
            Effect.mapError((cause) => `Failed to find document: ${cause}`),
          );
          if (!doc || doc.deletedAt) {
            return yield* Effect.fail(`Document not found: ${payload.documentId}`);
          }

          const collection = yield* collectionService.getById(payload.collectionId).pipe(
            Effect.mapError(mapServiceError),
          );
          const schema = SchemaJSON.fromJSON(collection.schemaJson) as Primitive.AnyPrimitive;
          const currentSnapshot = yield* gateway.getSnapshot(payload.collectionId, payload.documentId).pipe(
            Effect.mapError((cause) => `Failed to get document snapshot: ${cause}`),
          );

          const document = Document.make(schema, { initialState: currentSnapshot.state as any });
          document.transaction((root: any) => {
            root.update(payload.data);
          });
          const tx = document.flush();

          if (!Transaction.isEmpty(tx)) {
            const result = yield* gateway.submit(payload.collectionId, payload.documentId, tx).pipe(
              Effect.mapError((cause) => `Failed to submit update: ${cause}`),
            );
            if (!result.success) {
              return yield* Effect.fail(`Update rejected: ${result.reason}`);
            }
            return { id: payload.documentId, version: result.version };
          }

          return { id: payload.documentId, version: currentSnapshot.version };
        }),

      SetDocument: (payload) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          const databaseId = yield* resolveDatabaseId({ collectionId: payload.collectionId });
          if (databaseId) yield* checkDatabasePermission(user, databaseId, "SetDocument");

          const doc = yield* docRepo.findById(payload.documentId).pipe(
            Effect.mapError((cause) => `Failed to find document: ${cause}`),
          );
          if (!doc || doc.deletedAt) {
            return yield* Effect.fail(`Document not found: ${payload.documentId}`);
          }

          const collection = yield* collectionService.getById(payload.collectionId).pipe(
            Effect.mapError(mapServiceError),
          );
          const schema = SchemaJSON.fromJSON(collection.schemaJson) as Primitive.AnyPrimitive;
          const currentSnap = yield* gateway.getSnapshot(payload.collectionId, payload.documentId).pipe(
            Effect.mapError((cause) => `Failed to get document snapshot: ${cause}`),
          );

          const document = Document.make(schema, { initialState: currentSnap.state as any });
          document.transaction((root: any) => {
            root.set(payload.data);
          });
          const tx = document.flush();

          if (!Transaction.isEmpty(tx)) {
            const result = yield* gateway.submit(payload.collectionId, payload.documentId, tx).pipe(
              Effect.mapError((cause) => `Failed to submit set: ${cause}`),
            );
            if (!result.success) {
              return yield* Effect.fail(`Set rejected: ${result.reason}`);
            }
            return { id: payload.documentId, version: result.version };
          }

          return { id: payload.documentId, version: currentSnap.version };
        }),

      DeleteDocument: (payload) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          const databaseId = yield* resolveDatabaseId({ collectionId: payload.collectionId });
          if (databaseId) yield* checkDatabasePermission(user, databaseId, "DeleteDocument");

          yield* docRepo.softDelete(payload.documentId).pipe(
            Effect.mapError((cause) => `Failed to delete document: ${cause}`),
          );
        }),

      ListDocuments: (payload) =>
        Effect.gen(function* () {
          const user = yield* CurrentUser;
          const databaseId = yield* resolveDatabaseId({ collectionId: payload.collectionId });
          if (databaseId) yield* checkDatabasePermission(user, databaseId, "ListDocuments");

          const docs = yield* docRepo.listByCollection(payload.collectionId).pipe(
            Effect.mapError((cause) => `Failed to list documents: ${cause}`),
          );

          const results = [];
          for (const doc of docs) {
            const snapshot = yield* gateway.getSnapshot(payload.collectionId, doc.id).pipe(
              Effect.mapError((cause) => `Failed to get snapshot for ${doc.id}: ${cause}`),
            );
            results.push({
              id: doc.id,
              collectionId: payload.collectionId,
              state: snapshot.state,
              version: snapshot.version,
            });
          }

          return results;
        }),
    };
  }),
);
