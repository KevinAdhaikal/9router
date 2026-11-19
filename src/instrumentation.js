export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // In Vercel Serverless, skip heavy background syncing and buffer hooks
    // to keep cold start fast and prevent Fluid Active CPU waste.
    if (process.env.VERCEL) {
      return;
    }

    const { initConsoleLogCapture } = await import("@/lib/consoleLogBuffer");
    initConsoleLogCapture();

    // Server-only: lets capabilities.js read the synced catalog without pulling
    // node:fs into the dashboard's browser bundle.
    const { installCatalogSource } = await import("open-sse/providers/catalogOverride.js");
    await installCatalogSource();

    const { startModelCatalogSync } = await import("@/lib/modelCatalog/sync.js");
    startModelCatalogSync();
  }
}
