import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
	main: {
		plugins: [externalizeDepsPlugin()],
	},
	preload: {
		plugins: [externalizeDepsPlugin()],
	},
	renderer: {
		plugins: [tailwindcss(), tsconfigPaths(), viteReact()],
		root: "src/renderer",
		build: {
			rollupOptions: {
				input: "src/renderer/index.html",
			},
		},
	},
});
