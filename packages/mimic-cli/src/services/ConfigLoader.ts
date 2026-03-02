import { Effect, Layer, Schema, ServiceMap } from "effect";
import * as path from "node:path";
import * as fs from "node:fs";
import { loadConfigFile } from "../utils/js-loading/config-loader";

const CONFIG_FILE_NAMES = [
  "mimic.config.ts",
  "mimic.config.js",
  "mimic.config.cjs",
  "mimic.config.mjs",
];

const MimicConfigSchema = Schema.Struct({
  url: Schema.String,
  username: Schema.String,
  password: Schema.String,
  database: Schema.String,
  collections: Schema.Record(Schema.String, Schema.Unknown),
});

export interface ConfigLoaderShape {
  readonly load: () => Effect.Effect<typeof MimicConfigSchema.Type>;
}

export class ConfigLoader extends ServiceMap.Service<ConfigLoader, ConfigLoaderShape>()(
  "@voidhash/mimic-cli/ConfigLoader",
) {
  static Default = Layer.succeed(ConfigLoader, {
    load: () =>
      Effect.gen(function* () {
        // Load .env from CWD
        yield* Effect.tryPromise({
          try: async () => {
            const dotenv = await import("dotenv");
            dotenv.config({ path: path.resolve(process.cwd(), ".env") });
          },
          catch: () => undefined,
        }).pipe(Effect.ignore);

        // Find config file
        const cwd = process.cwd();
        let configPath: string | undefined;
        for (const name of CONFIG_FILE_NAMES) {
          const candidate = path.resolve(cwd, name);
          if (fs.existsSync(candidate)) {
            configPath = candidate;
            break;
          }
        }

        if (!configPath) {
          return yield* Effect.fail(
            new Error(
              `No mimic config file found. Create one of: ${CONFIG_FILE_NAMES.join(", ")}`
            )
          );
        }

        // Load config file via esbuild-register
        const rawConfig = yield* loadConfigFile(configPath).pipe(
          Effect.mapError((e) => new Error(`Failed to load config: ${e.message}`))
        );

        // Validate config shape
        const config = yield* Schema.decodeUnknown(MimicConfigSchema)(rawConfig).pipe(
          Effect.mapError((e) =>
            new Error(`Invalid mimic config:\n${String(e)}`)
          )
        );

        return config;
      }),
  });
}
