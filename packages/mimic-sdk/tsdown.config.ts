import { defineConfig } from "tsdown";

export default defineConfig({
  target: ["es2017"],
  entry: ["./src/index.ts", "./src/effect/index.ts"],
  dts: {
    sourcemap: true,
  },
  unbundle: true,
  format: ["cjs", "esm"],
  outExtensions: (ctx) => ({
    dts: ctx.format === "cjs" ? ".d.cts" : ".d.mts",
    js: ctx.format === "cjs" ? ".cjs" : ".mjs",
  }),
});
