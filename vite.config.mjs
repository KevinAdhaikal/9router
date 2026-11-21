import { defineConfig, transformWithOxc } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function jsxInJsPlugin() {
  return {
    name: "jsx-in-js",
    enforce: "pre",
    async transform(code, id) {
      const [filepath] = id.split("?");
      if (filepath.endsWith(".js") && !filepath.includes("node_modules")) {
        if (code.includes("<") && (code.includes("</") || code.includes("/>") || code.includes("<>"))) {
          return await transformWithOxc(code, id, {
            lang: "jsx",
            jsx: {
              runtime: "automatic",
            },
          });
        }
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [
    jsxInJsPlugin(),
    react(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "open-sse": path.resolve(__dirname, "./open-sse"),
      "next/server": path.resolve(__dirname, "./src/lib/shims/nextServer.js"),
      "next/headers": path.resolve(__dirname, "./src/lib/shims/nextHeaders.js"),
      "next/link": path.resolve(__dirname, "./src/lib/shims/nextLink.jsx"),
      "next/navigation": path.resolve(__dirname, "./src/lib/shims/nextNavigation.js"),
      "next/image": path.resolve(__dirname, "./src/lib/shims/nextImage.jsx"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
