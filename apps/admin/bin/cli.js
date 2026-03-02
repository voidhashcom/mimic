#!/usr/bin/env node

import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const distDir = join(__dirname, "..", "dist");

if (!existsSync(distDir)) {
	console.error("Error: dist directory not found. Run `pnpm build` first.");
	process.exit(1);
}

const mimeTypes = {
	".html": "text/html",
	".js": "application/javascript",
	".css": "text/css",
	".json": "application/json",
	".png": "image/png",
	".jpg": "image/jpeg",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
	".woff": "font/woff",
	".woff2": "font/woff2",
};

const port = process.env.PORT ? Number(process.env.PORT) : 4460;

const server = createServer((req, res) => {
	let filePath = join(distDir, req.url === "/" ? "index.html" : req.url);

	if (!existsSync(filePath)) {
		filePath = join(distDir, "index.html");
	}

	const ext = extname(filePath);
	const contentType = mimeTypes[ext] || "application/octet-stream";

	try {
		const content = readFileSync(filePath);
		res.writeHead(200, { "Content-Type": contentType });
		res.end(content);
	} catch {
		res.writeHead(404);
		res.end("Not found");
	}
});

server.listen(port, () => {
	const url = `http://localhost:${port}`;
	console.log(`Mimic Admin running at ${url}`);

	const openCmd =
		process.platform === "darwin"
			? "open"
			: process.platform === "win32"
				? "start"
				: "xdg-open";
	exec(`${openCmd} ${url}`);
});
