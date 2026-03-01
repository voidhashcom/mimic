import { Effect } from "effect";
import { Document, Transaction, SchemaJSON, type Primitive } from "@voidhash/mimic";
import { DatabaseServiceTag } from "../services/DatabaseService";
import { CollectionServiceTag } from "../services/CollectionService";
import { DatabaseRepositoryTag } from "../mysql/DatabaseRepository";
import { DocumentGatewayTag } from "../engine/DocumentGateway";
import { DocumentRepositoryTag } from "../mysql/DocumentRepository";
import type { RpcAuthContext } from "./RpcRoute";

const ADMIN_ONLY_METHODS = new Set([
  "CreateDatabase",
  "DeleteDatabase",
  "CreateCollection",
  "DeleteCollection",
  "CreateCredential",
  "DeleteCredential",
  "UpdateCollectionSchema",
]);

const WRITE_METHODS = new Set([
  "CreateDocument",
  "UpdateDocument",
  "SetDocument",
  "DeleteDocument",
]);

const READ_METHODS = new Set([
  "GetDocument",
  "ListDocuments",
  "ListDatabases",
  "ListCollections",
  "ListCredentials",
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
    case "DatabaseServiceError":
    case "CollectionServiceError":
      return { error: `Internal error: ${e.message}` };
    default:
      return { error: String(e) };
  }
};

const requireAuth = (auth: RpcAuthContext | undefined, method: string) => {
  if (!auth) {
    return Effect.fail({ error: `Authentication required for ${method}. Provide X-API-Key header.` });
  }

  const permission = auth.credential.permission;

  if (ADMIN_ONLY_METHODS.has(method)) {
    if (permission !== "admin") {
      return Effect.fail({ error: `Admin permission required for ${method}` });
    }
  } else if (WRITE_METHODS.has(method)) {
    if (permission !== "write" && permission !== "admin") {
      return Effect.fail({ error: `Write permission required for ${method}` });
    }
  } else if (READ_METHODS.has(method)) {
    // Any valid credential can read
  }

  return Effect.void;
};

export const handleRpc = (method: string, payload: any, auth?: RpcAuthContext) =>
  Effect.gen(function* () {
    const dbService = yield* DatabaseServiceTag;
    const collectionService = yield* CollectionServiceTag;
    const dbRepo = yield* DatabaseRepositoryTag;
    const gateway = yield* DocumentGatewayTag;
    const docRepo = yield* DocumentRepositoryTag;

    // Check authorization
    yield* requireAuth(auth, method);

    switch (method) {
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

      case "CreateCredential": {
        // Generate a random token
        const tokenBytes = new Uint8Array(32);
        crypto.getRandomValues(tokenBytes);
        const token = Array.from(tokenBytes)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        // Hash it for storage
        const encoder = new TextEncoder();
        const data = encoder.encode(token);
        const hashBuffer = yield* Effect.promise(() => crypto.subtle.digest("SHA-256", data));
        const hashArray = new Uint8Array(hashBuffer);
        const tokenHash = Array.from(hashArray)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");

        const cred = yield* dbService
          .createCredential(payload.databaseId, payload.label, tokenHash, payload.permission)
          .pipe(Effect.mapError(mapServiceError));
        return { id: cred.id, token };
      }

      case "ListCredentials": {
        const creds = yield* dbService.listCredentials(payload.databaseId).pipe(
          Effect.mapError(mapServiceError),
        );
        return creds.map((c) => ({ id: c.id, label: c.label, permission: c.permission }));
      }

      case "DeleteCredential": {
        yield* dbService.removeCredential(payload.id).pipe(Effect.mapError(mapServiceError));
        return null;
      }

      // Document RPCs

      case "CreateDocument": {
        const collection = yield* collectionService.getById(payload.collectionId).pipe(
          Effect.mapError(mapServiceError),
        );
        const schema = SchemaJSON.fromJSON(collection.schemaJson) as Primitive.AnyPrimitive;

        const documentId = payload.id ?? crypto.randomUUID();

        // Create document with initial data
        const doc = Document.make(schema, { initial: payload.data });
        doc.transaction((root: any) => {
          root.set(payload.data);
        });
        const tx = doc.flush();

        // Create metadata row
        yield* docRepo.create(documentId, payload.collectionId).pipe(
          Effect.mapError((cause) => ({ error: `Failed to create document: ${cause}` })),
        );

        // Submit transaction to gateway
        if (!Transaction.isEmpty(tx)) {
          yield* gateway.submit(payload.collectionId, documentId, tx).pipe(
            Effect.mapError((cause) => ({ error: `Failed to submit document transaction: ${cause}` })),
          );
        }

        // Get the snapshot back
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

        // Get current state
        const currentSnapshot = yield* gateway.getSnapshot(payload.collectionId, payload.documentId).pipe(
          Effect.mapError((cause) => ({ error: `Failed to get document snapshot: ${cause}` })),
        );

        // Create document with current state and apply partial update
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

        // Get current state
        const currentSnap = yield* gateway.getSnapshot(payload.collectionId, payload.documentId).pipe(
          Effect.mapError((cause) => ({ error: `Failed to get document snapshot: ${cause}` })),
        );

        // Create document with current state and do full replace
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
