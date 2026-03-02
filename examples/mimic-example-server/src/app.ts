import { Effect, Layer } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";
import { MimicSDK, MimicClientLayer } from "@voidhash/mimic-sdk/effect";
import { MimicExampleSchema } from "@voidhash/mimic-example-shared";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const HOST_URL = process.env.HOST_URL ?? "http://localhost:5001";
const HOST_USERNAME = process.env.HOST_USERNAME ?? "root";
const HOST_PASSWORD = process.env.HOST_PASSWORD ?? "root";

const DATABASE_NAME = "example";
const COLLECTION_NAME = "todos";
const DOCUMENT_ID = "kanban-board";

const SdkLayer = MimicClientLayer({
  url: HOST_URL,
  username: HOST_USERNAME,
  password: HOST_PASSWORD,
});

// ---------------------------------------------------------------------------
// Provisioning — ensures db, collection, and document exist
// ---------------------------------------------------------------------------

const provision = Effect.gen(function* () {
  // Ensure database exists
  const databases = yield* MimicSDK.listDatabases();
  const existingDb = databases.find((d) => d.name === DATABASE_NAME);
  const dbHandle = existingDb
    ? MimicSDK.database(existingDb.id, existingDb.name, existingDb.description)
    : yield* MimicSDK.createDatabase({ name: DATABASE_NAME });

  // Ensure collection exists
  const collections = yield* dbHandle.listCollections();
  const existingCol = collections.find((c) => c.name === COLLECTION_NAME);
  const colHandle = existingCol
    ? dbHandle.collection(existingCol.id, MimicExampleSchema)
    : yield* dbHandle.createCollection(COLLECTION_NAME, MimicExampleSchema);

  // Ensure document exists — create with default board if missing
  yield* colHandle.get(DOCUMENT_ID).pipe(
    Effect.catch(() =>
      colHandle.create(
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
      ),
    ),
  );

  yield* Effect.log(
    `Provisioned: db=${dbHandle.id} col=${colHandle.id} doc=${DOCUMENT_ID}`,
  );

  return { dbHandle, colHandle } as const;
});

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

const AllRoutes = Layer.mergeAll(TokenRoute).pipe(
  Layer.provide(SdkLayer),
  Layer.provide(
    HttpRouter.cors({
      allowedOrigins: ["http://localhost:3000"],
      credentials: true,
    }),
  ),
);

export const AppLive = HttpRouter.serve(AllRoutes);
