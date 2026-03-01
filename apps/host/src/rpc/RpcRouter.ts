import { Effect } from "effect";
import { DatabaseServiceTag } from "../services/DatabaseService";
import { CollectionServiceTag } from "../services/CollectionService";
import { DatabaseRepositoryTag } from "../mysql/DatabaseRepository";

export const handleRpc = (method: string, payload: any) =>
  Effect.gen(function* () {
    const dbService = yield* DatabaseServiceTag;
    const collectionService = yield* CollectionServiceTag;
    const dbRepo = yield* DatabaseRepositoryTag;

    switch (method) {
      case "CreateDatabase": {
        const db = yield* dbService.create(payload.name, payload.description).pipe(
          Effect.mapError((e) => ({ error: e._tag === "DatabaseAlreadyExistsError" ? `Database '${e.name}' already exists` : String(e) })),
        );
        return { id: db.id, name: db.name, description: db.description };
      }

      case "ListDatabases": {
        const dbs = yield* dbService.list();
        return dbs.map((db) => ({ id: db.id, name: db.name, description: db.description }));
      }

      case "DeleteDatabase": {
        yield* dbService.remove(payload.id).pipe(
          Effect.mapError((e) => ({ error: `Database not found: ${e.databaseId}` })),
        );
        return null;
      }

      case "CreateCollection": {
        const collection = yield* collectionService
          .create(payload.databaseId, payload.name, payload.schemaJson)
          .pipe(
            Effect.mapError((e) => ({
              error:
                e._tag === "CollectionAlreadyExistsError"
                  ? `Collection '${e.name}' already exists`
                  : e._tag === "DatabaseNotFoundError"
                    ? `Database not found: ${e.databaseId}`
                    : String(e),
            })),
          );
        return { id: collection.id, databaseId: collection.databaseId, name: collection.name };
      }

      case "ListCollections": {
        const collections = yield* collectionService.listByDatabase(payload.databaseId);
        return collections.map((c) => ({ id: c.id, databaseId: c.databaseId, name: c.name }));
      }

      case "DeleteCollection": {
        yield* collectionService.remove(payload.id).pipe(
          Effect.mapError((e) => ({ error: `Collection not found: ${e.collectionId}` })),
        );
        return null;
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
          .pipe(
            Effect.mapError((e) => ({ error: `Database not found: ${e.databaseId}` })),
          );
        return { id: cred.id, token };
      }

      case "ListCredentials": {
        const creds = yield* dbService.listCredentials(payload.databaseId);
        return creds.map((c) => ({ id: c.id, label: c.label, permission: c.permission }));
      }

      case "DeleteCredential": {
        yield* dbService.removeCredential(payload.id);
        return null;
      }

      default:
        return yield* Effect.fail({ error: `Unknown RPC method: ${method}` });
    }
  });
