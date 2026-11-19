export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // In Vercel Serverless, silence stdout logs to eliminate I/O overhead & save Fluid Active CPU
    if (process.env.VERCEL) {
      const noop = () => {};
      console.log = noop;
      console.info = noop;
      console.debug = noop;
      console.warn = noop;
      return;
    }

    // Server-only: lets capabilities.js read the synced catalog without pulling
    // node:fs into the dashboard's browser bundle.
    const { installCatalogSource } = await import("open-sse/providers/catalogOverride.js");
    await installCatalogSource();

    const { startModelCatalogSync } = await import("@/lib/modelCatalog/sync.js");
    startModelCatalogSync();
  }
}
