import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const pkg = (name: string, entry: string) =>
	resolve(__dirname, `../../packages/${name}/${entry}`);

export default defineConfig({
	plugins: [tailwindcss(), tsconfigPaths(), viteReact()],
	root: "src",
	resolve: {
		alias: {
			"@voidhash/mimic/server": pkg("mimic", "src/server/index.ts"),
			"@voidhash/mimic/client": pkg("mimic", "src/client/index.ts"),
			"@voidhash/mimic": pkg("mimic", "src/index.ts"),
			"@voidhash/mimic-effect/testing": pkg(
				"mimic-effect",
				"src/testing/index.ts",
			),
			"@voidhash/mimic-effect": pkg("mimic-effect", "src/index.ts"),
			"@voidhash/mimic-protocol": pkg("mimic-protocol", "src/index.ts"),
			"@voidhash/mimic-react/zustand-commander": pkg(
				"mimic-react",
				"src/zustand-commander/index.ts",
			),
			"@voidhash/mimic-react/zustand": pkg(
				"mimic-react",
				"src/zustand/index.ts",
			),
			"@voidhash/mimic-react": pkg("mimic-react", "src/index.ts"),
			"@voidhash/mimic-sdk/effect": pkg("mimic-sdk", "src/effect/index.ts"),
			"@voidhash/mimic-sdk": pkg("mimic-sdk", "src/index.ts"),
		},
	},
	build: {
		outDir: "../dist",
		emptyOutDir: true,
	},
});
