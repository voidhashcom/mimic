import { Effect, Layer, Schedule } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";
import { MimicSDK, MimicClientLayer } from "@voidhash/mimic-sdk/effect";
import { MimicExampleSchema } from "@voidhash/mimic-example-shared";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const HOST_URL = process.env.HOST_URL;
const HOST_USERNAME = process.env.HOST_USERNAME;
const HOST_PASSWORD = process.env.HOST_PASSWORD;

const DATABASE_NAME = "example";
const COLLECTION_NAME = "todos";
const DOCUMENT_ID = "kanban-board";

const SdkLayer = MimicClientLayer({
  url: HOST_URL ?? "http://localhost:5001",
  username: HOST_USERNAME ?? "root",
  password: HOST_PASSWORD ?? "password",
});

// ---------------------------------------------------------------------------
// Provisioning — ensures db, collection, and document exist
// ---------------------------------------------------------------------------

const provision = Effect.gen(function* () {
  // Ensure database exists
  yield* Effect.log("Provision: listing databases...");
  const databases = yield* MimicSDK.listDatabases();
  yield* Effect.log(`Provision: found ${databases.length} databases`);
  const existingDb = databases.find((d) => d.name === DATABASE_NAME);
  const dbHandle = existingDb
    ? MimicSDK.database(existingDb.id, existingDb.name, existingDb.description)
    : yield* MimicSDK.createDatabase({ name: DATABASE_NAME });
  yield* Effect.log(`Provision: db=${dbHandle.id}`);

  // Ensure collection exists
  yield* Effect.log("Provision: listing collections...");
  const collections = yield* dbHandle.listCollections();
  yield* Effect.log(`Provision: found ${collections.length} collections`);
  const existingCol = collections.find((c) => c.name === COLLECTION_NAME);

  yield* Effect.log(
    `Provision: ${existingCol ? "found" : "creating"} collection...`,
  );
  const colHandle = existingCol
    ? dbHandle.collection(existingCol.id, MimicExampleSchema)
    : yield* dbHandle.createCollection(COLLECTION_NAME, MimicExampleSchema);
  yield* Effect.log(`Provision: col=${colHandle.id}`);

  // Ensure document exists — create with default board if missing
  yield* Effect.log("Provision: checking document...");
  yield* colHandle.get(DOCUMENT_ID).pipe(
    Effect.tap(() => Effect.log("Provision: document exists")),
    Effect.catch(() => {
      return colHandle.create(
        {
          type: "board" as const,
          name: "My Board",
          children: [
            { type: "column" as const, name: "Todo", children: [] },
            { type: "column" as const, name: "In Progress", children: [] },
            { type: "column" as const, name: "Done", children: [] },
          ],
        },
        { id: DOCUMENT_ID },
      );
    }),
  );

  yield* Effect.log(
    `Provisioned: db=${dbHandle.id} col=${colHandle.id} doc=${DOCUMENT_ID}`,
  );

  return { dbHandle, colHandle } as const;
}).pipe(
  Effect.tapCause((cause) => Effect.log(`Provision failed: ${cause}`)),
  Effect.retry(
    Schedule.exponential("1 second").pipe(
      Schedule.compose(Schedule.recurs(15)),
    ),
  ),
);

// ---------------------------------------------------------------------------
// HTTP routes
// ---------------------------------------------------------------------------

const TokenRoute = Layer.effectDiscard(
  Effect.gen(function* () {
    // Provision on startup and cache the handles
    const { dbHandle, colHandle } = yield* provision;

    const router = yield* HttpRouter.HttpRouter;
    yield* router.add(
      "GET",
      "/api/token",
      Effect.gen(function* () {
        const { token } = yield* colHandle.createDocumentToken(
          DOCUMENT_ID,
          "write",
        );

        return yield* HttpServerResponse.json({
          token,
          databaseId: dbHandle.id,
          collectionId: colHandle.id,
          documentId: DOCUMENT_ID,
        });
      }).pipe(Effect.provide(SdkLayer)),
    );
  }),
);

const corsAllowedOrigins = (): ReadonlyArray<string> => {
  const env = process.env.CORS_ORIGINS?.trim();
  if (!env) return ["http://localhost:5173"];
  return env.split(",").map((o) => o.trim());
};

const AllRoutes = Layer.mergeAll(TokenRoute).pipe(
  Layer.provide(SdkLayer),
  Layer.provide(
    HttpRouter.cors({
      allowedOrigins: corsAllowedOrigins(),
      credentials: true,
    }),
  ),
);

export const AppLive = HttpRouter.serve(AllRoutes);
