import { Effect, Layer, Logger, LogLevel } from "effect";
import { Command } from "effect/unstable/cli";

import { ConfigLoader } from "../services/ConfigLoader";
import { isDebugMode, withErrorHandler } from "../utils/error-formatter";
import { initCommand } from "./commands/init";
import { pushCommand } from "./commands/push";

const command = Command.make("mimic").pipe(
  Command.withDescription("Mimic CLI - manage your Mimic collections"),
  Command.withSubcommands([initCommand, pushCommand])
);

const cliEffect = Command.run(command, {
  version: "1.0.0-beta.1",
}).pipe(
  isDebugMode() ? Logger.withMinimumLogLevel(LogLevel.Debug) : (x) => x
);

const MainLayer = ConfigLoader.Default;

cliEffect.pipe(
  Effect.provide(MainLayer),
  withErrorHandler,
  Effect.runPromise,
).catch((err) => {
  console.error(err);
  process.exit(1);
});
