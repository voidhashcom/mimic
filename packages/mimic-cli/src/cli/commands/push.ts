import { Console, Effect } from "effect";
import { Command, Flag, Prompt } from "effect/unstable/cli";
import { RpcClient } from "effect/unstable/rpc";
import { MimicRpcs } from "@voidhash/mimic-protocol";
import { MimicClientLayer } from "@voidhash/mimic-sdk/effect";
import { SchemaJSON, type Primitive } from "@voidhash/mimic";
import { ConfigLoader } from "../../services/ConfigLoader";

export const pushCommand = Command.make(
  "push",
  {
    dryRun: Flag.boolean("dry-run").pipe(
      Flag.withDescription("Show what would be done without making changes"),
      Flag.withDefault(false)
    ),
    yes: Flag.boolean("yes").pipe(
      Flag.withAlias("y"),
      Flag.withDescription("Skip confirmation prompt"),
      Flag.withDefault(false)
    ),
  },
  ({ dryRun, yes }) =>
    Effect.gen(function* () {
      const configLoader = yield* ConfigLoader;
      const config = yield* configLoader.load();

      yield* Console.log(`Connecting to ${config.url}...`);

      const clientLayer = MimicClientLayer({
        url: config.url,
        username: config.username,
        password: config.password,
      });

      yield* Effect.scoped(
        Effect.gen(function* () {
          const client = yield* RpcClient.make(MimicRpcs);

          // Find database by name
          const databases = yield* client.ListDatabases(undefined as any);
          const db = (databases as any[]).find(
            (d: any) => d.name === config.database
          );
          if (!db) {
            return yield* Effect.fail(
              new Error(
                `Database "${config.database}" not found. Available databases: ${(databases as any[]).map((d: any) => d.name).join(", ") || "(none)"}`
              )
            );
          }

          // List existing collections
          const existingCollections = yield* client.ListCollections({
            databaseId: db.id,
          });
          const existingByName = new Map(
            (existingCollections as any[]).map((c: any) => [c.name, c])
          );

          const configCollections = Object.entries(config.collections);
          const toCreate: string[] = [];
          const toUpdate: string[] = [];

          for (const [name] of configCollections) {
            if (existingByName.has(name)) {
              toUpdate.push(name);
            } else {
              toCreate.push(name);
            }
          }

          // Display plan
          if (toCreate.length === 0 && toUpdate.length === 0) {
            yield* Console.log("No changes to apply.");
            return;
          }

          yield* Console.log("\nPlan:");
          for (const name of toCreate) {
            yield* Console.log(`  + create collection "${name}"`);
          }
          for (const name of toUpdate) {
            yield* Console.log(`  ~ update collection "${name}"`);
          }
          yield* Console.log("");

          if (dryRun) {
            yield* Console.log("Dry run complete. No changes applied.");
            return;
          }

          // Confirm
          if (!yes) {
            const confirmed = yield* Prompt.confirm({
              message: "Apply these changes?",
            });
            if (!confirmed) {
              yield* Console.log("Aborted.");
              return;
            }
          }

          // Execute
          let created = 0;
          let updated = 0;

          for (const name of toCreate) {
            const primitive = config.collections[name] as Primitive.AnyPrimitive;
            const schemaJson = SchemaJSON.toJSON(primitive);
            yield* client.CreateCollection({
              databaseId: db.id,
              name,
              schemaJson,
            });
            yield* Console.log(`  + created "${name}"`);
            created++;
          }

          for (const name of toUpdate) {
            const primitive = config.collections[name] as Primitive.AnyPrimitive;
            const schemaJson = SchemaJSON.toJSON(primitive);
            const existing = existingByName.get(name)!;
            yield* client.UpdateCollectionSchema({
              id: (existing as any).id,
              schemaJson,
            });
            yield* Console.log(`  ~ updated "${name}"`);
            updated++;
          }

          yield* Console.log(
            `\nDone. Created ${created}, updated ${updated} collection(s).`
          );
        })
      ).pipe(Effect.provide(clientLayer));
    })
).pipe(Command.withDescription("Push collection schemas to the Mimic server"));
