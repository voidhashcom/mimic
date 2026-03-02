import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";
import * as tsup from "tsup";
import pkg from "./package.json" with { type: "json" };

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Resolve workspace packages to their TypeScript source
const workspaceSourcePlugin: esbuild.Plugin = {
  name: "workspace-source",
  setup(build) {
    const workspacePackages: Record<string, string> = {
      "@voidhash/mimic": "../../packages/mimic/src/index.ts",
      "@voidhash/mimic-protocol": "../../packages/mimic-protocol/src/index.ts",
      "@voidhash/mimic-sdk/effect": "../../packages/mimic-sdk/src/effect/index.ts",
      "@voidhash/mimic-sdk": "../../packages/mimic-sdk/src/index.ts",
    };

    // Collect external patterns from the build options
    const externals = new Set(build.initialOptions.external ?? []);

    build.onResolve({ filter: /^@voidhash\// }, (args) => {
      // Don't resolve packages that should stay external
      if (externals.has(args.path)) {
        return { path: args.path, external: true };
      }
      const mapped = workspacePackages[args.path];
      if (mapped) {
        return { path: path.resolve(__dirname, mapped) };
      }
      return undefined;
    });
  },
};

const main = async () => {
  await esbuild.build({
    banner: { js: "#!/usr/bin/env node" },
    bundle: true,
    define: {
      "process.env.MIMIC_CLI_VERSION": `"${pkg.version}"`,
    },
    entryPoints: ["./src/cli/index.ts"],
    external: ["esbuild", "effect", "effect/*", "@voidhash/mimic", "@voidhash/mimic-protocol", "@voidhash/mimic-sdk", "@voidhash/mimic-sdk/*"],
    format: "cjs",
    outfile: "dist/bin.cjs",
    platform: "node",
    plugins: [workspaceSourcePlugin],
    target: "node16",
  });

  await tsup.build({
    dts: true,
    entryPoints: ["./src/index.ts"],
    external: ["esbuild", "@voidhash/mimic"],
    format: ["cjs", "esm"],
    outDir: "./dist",
    outExtension: (ctx) => {
      if (ctx.format === "cjs") return { dts: ".d.ts", js: ".js" };
      return { dts: ".d.mts", js: ".mjs" };
    },
    splitting: false,
  });
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
