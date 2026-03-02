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
// Startup — looks up existing db/collection (provisioned via `mimic push`)
// and seeds the default document if missing
// ---------------------------------------------------------------------------

const startup = Effect.gen(function* () {
  // Look up database by name (must already exist)
  yield* Effect.log("Startup: looking up database...");
  const databases = yield* MimicSDK.listDatabases();
  const existingDb = databases.find((d) => d.name === DATABASE_NAME);
  if (!existingDb) {
    return yield* Effect.fail(
      new Error(
        `Database "${DATABASE_NAME}" not found. Run \`mimic push\` first to provision the schema.`,
      ),
    );
  }
  const dbHandle = MimicSDK.database(
    existingDb.id,
    existingDb.name,
    existingDb.description,
  );
  yield* Effect.log(`Startup: db=${dbHandle.id}`);

  // Look up collection by name (must already exist)
  yield* Effect.log("Startup: looking up collection...");
  const collections = yield* dbHandle.listCollections();
  const existingCol = collections.find((c) => c.name === COLLECTION_NAME);
  if (!existingCol) {
    return yield* Effect.fail(
      new Error(
        `Collection "${COLLECTION_NAME}" not found in database "${DATABASE_NAME}". Run \`mimic push\` first to provision the schema.`,
      ),
    );
  }
  const colHandle = dbHandle.collection(existingCol.id, MimicExampleSchema);
  yield* Effect.log(`Startup: col=${colHandle.id}`);

  // Seed default document if missing
  yield* Effect.log("Startup: checking document...");
  yield* colHandle.get(DOCUMENT_ID).pipe(
    Effect.tap(() => Effect.log("Startup: document exists")),
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
    `Ready: db=${dbHandle.id} col=${colHandle.id} doc=${DOCUMENT_ID}`,
  );

  return { dbHandle, colHandle } as const;
}).pipe(
  Effect.tapCause((cause) => Effect.log(`Startup failed: ${cause}`)),
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
    const { dbHandle, colHandle } = yield* startup;

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
