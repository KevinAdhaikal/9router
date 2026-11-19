import { createNeonAdapter } from "./adapters/neonAdapter.js";

// Use global to survive Next.js dev hot-reload (module state resets on reload)
if (!global._dbAdapter) global._dbAdapter = { instance: null, initPromise: null, logged: false };
const state = global._dbAdapter;

export function getDatabaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.NEON_DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    ""
  );
}

async function initAdapter() {
  const dbUrl = getDatabaseUrl();
  if (!dbUrl) {
    throw new Error(
      "[DB] Missing DATABASE_URL or POSTGRES_URL environment variable. Please set DATABASE_URL to your Vercel Neon Database connection string."
    );
  }

  const adapter = createNeonAdapter(dbUrl);

  if (!state.logged) {
    const masked = dbUrl.replace(/:\/\/[^:]+:[^@]+@/, "://***:***@");
    console.log(`[DB] Driver: ${adapter.driver} (Neon Serverless PostgreSQL) | ${masked}`);
    state.logged = true;
  }

  const { runMigrationOnce } = await import("./migrate.js");
  await runMigrationOnce(adapter);
  return adapter;
}

export async function getAdapter() {
  if (state.instance) return state.instance;
  if (!state.initPromise) {
    state.initPromise = initAdapter()
      .then((a) => {
        state.instance = a;
        return a;
      })
      .catch((err) => {
        state.initPromise = null;
        throw err;
      });
  }
  return state.initPromise;
}

export async function closeAdapter() {
  if (state.instance) {
    try {
      await state.instance.close();
    } catch {}
    state.instance = null;
    state.initPromise = null;
  }
}
