import { Effect, Layer, Logger } from "effect";
import { Command } from "effect/unstable/cli";
import { layer as NodeChildProcessSpawnerLayer } from "@effect/platform-node-shared/NodeChildProcessSpawner";
import { layer as NodeFileSystemLayer } from "@effect/platform-node-shared/NodeFileSystem";
import { layer as NodePathLayer } from "@effect/platform-node-shared/NodePath";
import { layer as NodeTerminalLayer } from "@effect/platform-node-shared/NodeTerminal";

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
  isDebugMode() ? Effect.withLogger(Logger.consolePretty()) : (x) => x
);

const NodeEnvLayer = Layer.mergeAll(
  NodeFileSystemLayer,
  NodePathLayer,
  NodeTerminalLayer,
  NodeChildProcessSpawnerLayer.pipe(
    Layer.provide(Layer.mergeAll(NodeFileSystemLayer, NodePathLayer))
  ),
);

const MainLayer = Layer.mergeAll(ConfigLoader.Default, NodeEnvLayer);

cliEffect.pipe(
  Effect.provide(MainLayer),
  withErrorHandler,
  Effect.runPromise,
).catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
