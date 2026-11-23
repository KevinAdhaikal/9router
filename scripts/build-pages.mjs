import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const distDir = path.resolve(rootDir, "dist");
const tmpDir = path.resolve(rootDir, ".wrangler/tmp/pages-bundle");

console.log("==> 1. Building Vite SPA Frontend...");
execSync("npx vite build", { cwd: rootDir, stdio: "inherit" });

console.log("==> 2. Bundling Worker for Cloudflare Pages Advanced Mode...");
fs.mkdirSync(tmpDir, { recursive: true });

execSync(`npx wrangler deploy --config wrangler.worker.jsonc --dry-run --outdir "${tmpDir}"`, {
  cwd: rootDir,
  stdio: "inherit",
});

const bundledWorkerPath = path.join(tmpDir, "index.js");
const bundledMapPath = path.join(tmpDir, "index.js.map");
const targetWorkerPath = path.join(distDir, "_worker.js");
const targetMapPath = path.join(distDir, "_worker.js.map");

if (!fs.existsSync(bundledWorkerPath)) {
  throw new Error(`Worker bundle not found at ${bundledWorkerPath}`);
}

fs.copyFileSync(bundledWorkerPath, targetWorkerPath);
if (fs.existsSync(bundledMapPath)) {
  fs.copyFileSync(bundledMapPath, targetMapPath);
}
console.log(`==> Copied worker bundle to ${targetWorkerPath}`);

// Polyfill process.versions.node and sanitize unsupported node:sqlite imports
let workerCode = fs.readFileSync(targetWorkerPath, "utf8");

const polyfillHeader = `// Runtime polyfill for Cloudflare Pages/Workers
if (typeof globalThis.process === "undefined") {
  globalThis.process = { env: { CLOUDFLARE_WORKERS: "1" }, versions: { node: "22.0.0" } };
} else {
  globalThis.process.env = globalThis.process.env || {};
  globalThis.process.env.CLOUDFLARE_WORKERS = "1";
  globalThis.process.versions = globalThis.process.versions || {};
  if (!globalThis.process.versions.node) {
    globalThis.process.versions.node = "22.0.0";
  }
}
`;

workerCode = polyfillHeader + workerCode;

workerCode = workerCode.replace(
  /import\s+([A-Za-z0-9_$]+)\s+from\s+["']node:sqlite["'];?/g,
  "var $1 = {};"
);
workerCode = workerCode.replace(
  /import\(["']node:sqlite["']\)/g,
  "Promise.resolve({})"
);
fs.writeFileSync(targetWorkerPath, workerCode, "utf8");
console.log("==> Injected process polyfill & sanitized node:sqlite for Pages compatibility");

const assetsIgnoreDist = path.join(distDir, ".assetsignore");
const routesJsonDist = path.join(distDir, "_routes.json");

if (!fs.existsSync(assetsIgnoreDist)) {
  fs.writeFileSync(assetsIgnoreDist, "_worker.js\n_worker.js.map\n_routes.json\n");
}

if (!fs.existsSync(routesJsonDist)) {
  const routesConfig = {
    version: 1,
    include: ["/*"],
    exclude: [
      "/assets/*",
      "/icons/*",
      "/favicon.svg",
      "/file.svg",
      "/globe.svg",
      "/next.svg",
      "/sw.js",
      "/vercel.svg",
      "/window.svg",
    ],
  };
  fs.writeFileSync(routesJsonDist, JSON.stringify(routesConfig, null, 2) + "\n");
}

console.log("==> Cloudflare Pages build complete!");
