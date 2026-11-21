import { createUpstashRedisAdapter } from "./adapters/upstashRedisAdapter.js";

// Use global to survive Next.js dev hot-reload (module state resets on reload)
if (!global._dbAdapter) global._dbAdapter = { instance: null, initPromise: null, logged: false };
const state = global._dbAdapter;

export function getDatabaseUrl() {
  return (
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.REDIS_URL ||
    process.env.KV_URL ||
    ""
  );
}

export function getDatabaseToken() {
  return (
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    ""
  );
}

async function initAdapter() {
  const dbUrl = getDatabaseUrl();
  const dbToken = getDatabaseToken();

  if (!dbUrl || !dbToken) {
    throw new Error(
      "[DB] Missing KV_REST_API_URL or KV_REST_API_TOKEN environment variable. Please connect your Upstash for Redis store in Vercel."
    );
  }

  const adapter = createUpstashRedisAdapter({ url: dbUrl, token: dbToken });

  if (!state.logged) {
    console.log(`[DB] Driver: ${adapter.driver} (Upstash for Redis Singapore) | ${dbUrl}`);
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
