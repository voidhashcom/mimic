import { Effect } from "effect";
import { Document, Transaction, SchemaJSON, type Primitive } from "@voidhash/mimic";
import { DatabaseServiceTag } from "../services/DatabaseService";
import { CollectionServiceTag } from "../services/CollectionService";
import { UserServiceTag } from "../services/UserService";
import { DocumentTokenServiceTag } from "../services/DocumentTokenService";
import { DocumentGatewayTag } from "../engine/DocumentGateway";
import { DocumentRepositoryTag } from "../mysql/DocumentRepository";
import type { RpcAuthContext } from "../auth/AuthService";

const SUPERUSER_ONLY_METHODS = new Set([
  "CreateDatabase",
  "DeleteDatabase",
  "ListDatabases",
  "CreateUser",
  "DeleteUser",
  "ListUsers",
  "GrantPermission",
  "RevokePermission",
]);

const DATABASE_SCOPED_METHODS = new Set([
  "CreateCollection",
  "DeleteCollection",
  "ListCollections",
  "UpdateCollectionSchema",
  "CreateDocument",
  "GetDocument",
  "UpdateDocument",
  "SetDocument",
  "DeleteDocument",
  "ListDocuments",
  "CreateDocumentToken",
]);

const WRITE_METHODS = new Set([
  "CreateDocument",
  "UpdateDocument",
  "SetDocument",
  "DeleteDocument",
  "CreateDocumentToken",
]);

const ADMIN_METHODS = new Set([
  "CreateCollection",
  "DeleteCollection",
  "UpdateCollectionSchema",
]);

const mapServiceError = (e: { _tag: string; [key: string]: any }) => {
  switch (e._tag) {
    case "DatabaseAlreadyExistsError":
      return { error: `Database '${e.name}' already exists` };
    case "DatabaseNotFoundError":
      return { error: `Database not found: ${e.databaseId}` };
    case "CollectionAlreadyExistsError":
      return { error: `Collection '${e.name}' already exists` };
    case "CollectionNotFoundError":
      return { error: `Collection not found: ${e.collectionId}` };
    case "DocumentNotFoundError":
      return { error: `Document not found: ${e.documentId}` };
    case "UserAlreadyExistsError":
      return { error: `User '${e.username}' already exists` };
    case "UserNotFoundError":
      return { error: `User not found: ${e.userId}` };
    case "GrantNotFoundError":
      return { error: `Grant not found for user ${e.userId} on database ${e.databaseId}` };
    case "DatabaseServiceError":
    case "CollectionServiceError":
    case "UserServiceError":
      return { error: `Internal error: ${e.message}` };
    default:
      return { error: String(e) };
  }
};

const requireAuth = (auth: RpcAuthContext | undefined, method: string) => {
  if (!auth) {
    return Effect.fail({ error: `Authentication required for ${method}. Provide Authorization: Basic header.` });
  }
  return Effect.void;
};

const requireSuperuser = (auth: RpcAuthContext, method: string) => {
  if (!auth.isSuperuser) {
    return Effect.fail({ error: `Superuser permission required for ${method}` });
  }
  return Effect.void;
};

export const handleRpc = (method: string, payload: any, auth?: RpcAuthContext) =>
  Effect.gen(function* () {
    const dbService = yield* DatabaseServiceTag;
    const collectionService = yield* CollectionServiceTag;
    const userService = yield* UserServiceTag;
    const documentTokenService = yield* DocumentTokenServiceTag;
    const gateway = yield* DocumentGatewayTag;
    const docRepo = yield* DocumentRepositoryTag;

    // Check authentication
    yield* requireAuth(auth, method);
    const authCtx = auth!;

    // Superuser-only methods
    if (SUPERUSER_ONLY_METHODS.has(method)) {
      yield* requireSuperuser(authCtx, method);
    }

    // Database-scoped methods: check user has grant on the relevant database
    if (DATABASE_SCOPED_METHODS.has(method)) {
      if (!authCtx.isSuperuser) {
        // Resolve databaseId from collection if needed
        let databaseId: string | undefined;
        if (payload.databaseId) {
          databaseId = payload.databaseId;
        } else if (payload.collectionId) {
          const collection = yield* collectionService.getById(payload.collectionId).pipe(
            Effect.mapError(mapServiceError),
          );
          databaseId = collection.databaseId;
        }

        if (databaseId) {
          const grant = yield* userService.getUserPermissionForDatabase(authCtx.userId, databaseId).pipe(
            Effect.mapError(mapServiceError),
          );
          if (!grant) {
            return yield* Effect.fail({ error: `No permission on database ${databaseId}` });
          }

          // Check permission level
          if (ADMIN_METHODS.has(method) && grant.permission !== "admin") {
            return yield* Effect.fail({ error: `Admin permission required for ${method}` });
          }
          if (WRITE_METHODS.has(method) && grant.permission === "read") {
            return yield* Effect.fail({ error: `Write permission required for ${method}` });
          }
        }
      }
    }

    switch (method) {
      // Database RPCs
      case "CreateDatabase": {
        const db = yield* dbService.create(payload.name, payload.description).pipe(
          Effect.mapError(mapServiceError),
        );
        return { id: db.id, name: db.name, description: db.description };
      }

      case "ListDatabases": {
        const dbs = yield* dbService.list().pipe(Effect.mapError(mapServiceError));
        return dbs.map((db) => ({ id: db.id, name: db.name, description: db.description }));
      }

      case "DeleteDatabase": {
        yield* dbService.remove(payload.id).pipe(Effect.mapError(mapServiceError));
        return null;
      }

      // Collection RPCs
      case "CreateCollection": {
        const collection = yield* collectionService
          .create(payload.databaseId, payload.name, payload.schemaJson)
          .pipe(Effect.mapError(mapServiceError));
        return { id: collection.id, databaseId: collection.databaseId, name: collection.name };
      }

      case "ListCollections": {
        const collections = yield* collectionService.listByDatabase(payload.databaseId).pipe(
          Effect.mapError(mapServiceError),
        );
        return collections.map((c) => ({ id: c.id, databaseId: c.databaseId, name: c.name }));
      }

      case "DeleteCollection": {
        yield* collectionService.remove(payload.id).pipe(Effect.mapError(mapServiceError));
        return null;
      }

      case "UpdateCollectionSchema": {
        const updated = yield* collectionService
          .updateSchema(payload.id, payload.schemaJson)
          .pipe(Effect.mapError(mapServiceError));
        return { id: updated.id, schemaVersion: updated.schemaVersion };
      }

      // User RPCs
      case "CreateUser": {
        const user = yield* userService.createUser(payload.username, payload.password).pipe(
          Effect.mapError(mapServiceError),
        );
        return { id: user.id, username: user.username };
      }

      case "ListUsers": {
        const users = yield* userService.listUsers().pipe(Effect.mapError(mapServiceError));
        return users.map((u) => ({ id: u.id, username: u.username, isSuperuser: u.isSuperuser }));
      }

      case "DeleteUser": {
        yield* userService.deleteUser(payload.id).pipe(Effect.mapError(mapServiceError));
        return null;
      }

      case "GrantPermission": {
        yield* userService
          .grantPermission(payload.userId, payload.databaseId, payload.permission)
          .pipe(Effect.mapError(mapServiceError));
        return null;
      }

      case "RevokePermission": {
        yield* userService
          .revokePermission(payload.userId, payload.databaseId)
          .pipe(Effect.mapError(mapServiceError));
        return null;
      }

      case "ListGrants": {
        // Superuser sees all, others see own
        const userId = authCtx.isSuperuser ? payload.userId : authCtx.userId;
        const grants = yield* userService.listGrants(userId).pipe(
          Effect.mapError(mapServiceError),
        );
        return grants.map((g) => ({
          id: g.id,
          userId: g.userId,
          databaseId: g.databaseId,
          permission: g.permission,
        }));
      }

      // Document Token RPCs
      case "CreateDocumentToken": {
        const result = yield* documentTokenService
          .createToken(payload.collectionId, payload.documentId, payload.permission, payload.expiresInSeconds)
          .pipe(Effect.mapError(mapServiceError));
        return { token: result.token };
      }

      // Document RPCs
      case "CreateDocument": {
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
          Effect.mapError((cause) => ({ error: `Failed to create document: ${cause}` })),
        );

        if (!Transaction.isEmpty(tx)) {
          yield* gateway.submit(payload.collectionId, documentId, tx).pipe(
            Effect.mapError((cause) => ({ error: `Failed to submit document transaction: ${cause}` })),
          );
        }

        const snapshot = yield* gateway.getSnapshot(payload.collectionId, documentId).pipe(
          Effect.mapError((cause) => ({ error: `Failed to get document snapshot: ${cause}` })),
        );

        return {
          id: documentId,
          collectionId: payload.collectionId,
          state: snapshot.state,
          version: snapshot.version,
        };
      }

      case "GetDocument": {
        const doc = yield* docRepo.findById(payload.documentId).pipe(
          Effect.mapError((cause) => ({ error: `Failed to find document: ${cause}` })),
        );
        if (!doc || doc.deletedAt) {
          return yield* Effect.fail({ error: `Document not found: ${payload.documentId}` });
        }

        const snapshot = yield* gateway.getSnapshot(payload.collectionId, payload.documentId).pipe(
          Effect.mapError((cause) => ({ error: `Failed to get document snapshot: ${cause}` })),
        );

        return {
          id: payload.documentId,
          collectionId: payload.collectionId,
          state: snapshot.state,
          version: snapshot.version,
        };
      }

      case "UpdateDocument": {
        const doc = yield* docRepo.findById(payload.documentId).pipe(
          Effect.mapError((cause) => ({ error: `Failed to find document: ${cause}` })),
        );
        if (!doc || doc.deletedAt) {
          return yield* Effect.fail({ error: `Document not found: ${payload.documentId}` });
        }

        const collection = yield* collectionService.getById(payload.collectionId).pipe(
          Effect.mapError(mapServiceError),
        );
        const schema = SchemaJSON.fromJSON(collection.schemaJson) as Primitive.AnyPrimitive;

        const currentSnapshot = yield* gateway.getSnapshot(payload.collectionId, payload.documentId).pipe(
          Effect.mapError((cause) => ({ error: `Failed to get document snapshot: ${cause}` })),
        );

        const document = Document.make(schema, { initialState: currentSnapshot.state as any });
        document.transaction((root: any) => {
          root.update(payload.data);
        });
        const tx = document.flush();

        if (!Transaction.isEmpty(tx)) {
          const result = yield* gateway.submit(payload.collectionId, payload.documentId, tx).pipe(
            Effect.mapError((cause) => ({ error: `Failed to submit update: ${cause}` })),
          );
          if (!result.success) {
            return yield* Effect.fail({ error: `Update rejected: ${result.reason}` });
          }
          return { id: payload.documentId, version: result.version };
        }

        return { id: payload.documentId, version: currentSnapshot.version };
      }

      case "SetDocument": {
        const doc = yield* docRepo.findById(payload.documentId).pipe(
          Effect.mapError((cause) => ({ error: `Failed to find document: ${cause}` })),
        );
        if (!doc || doc.deletedAt) {
          return yield* Effect.fail({ error: `Document not found: ${payload.documentId}` });
        }

        const collection = yield* collectionService.getById(payload.collectionId).pipe(
          Effect.mapError(mapServiceError),
        );
        const schema = SchemaJSON.fromJSON(collection.schemaJson) as Primitive.AnyPrimitive;

        const currentSnap = yield* gateway.getSnapshot(payload.collectionId, payload.documentId).pipe(
          Effect.mapError((cause) => ({ error: `Failed to get document snapshot: ${cause}` })),
        );

        const document = Document.make(schema, { initialState: currentSnap.state as any });
        document.transaction((root: any) => {
          root.set(payload.data);
        });
        const tx = document.flush();

        if (!Transaction.isEmpty(tx)) {
          const result = yield* gateway.submit(payload.collectionId, payload.documentId, tx).pipe(
            Effect.mapError((cause) => ({ error: `Failed to submit set: ${cause}` })),
          );
          if (!result.success) {
            return yield* Effect.fail({ error: `Set rejected: ${result.reason}` });
          }
          return { id: payload.documentId, version: result.version };
        }

        return { id: payload.documentId, version: currentSnap.version };
      }

      case "DeleteDocument": {
        yield* docRepo.softDelete(payload.documentId).pipe(
          Effect.mapError((cause) => ({ error: `Failed to delete document: ${cause}` })),
        );
        return null;
      }

      case "ListDocuments": {
        const docs = yield* docRepo.listByCollection(payload.collectionId).pipe(
          Effect.mapError((cause) => ({ error: `Failed to list documents: ${cause}` })),
        );

        const results = [];
        for (const doc of docs) {
          const snapshot = yield* gateway.getSnapshot(payload.collectionId, doc.id).pipe(
            Effect.mapError((cause) => ({ error: `Failed to get snapshot for ${doc.id}: ${cause}` })),
          );
          results.push({
            id: doc.id,
            collectionId: payload.collectionId,
            state: snapshot.state,
            version: snapshot.version,
          });
        }

        return results;
      }

      default:
        return yield* Effect.fail({ error: `Unknown RPC method: ${method}` });
    }
  });
