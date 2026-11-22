import { ensureDirs, DATA_FILE } from "./paths.js";
import { stripNullBytes } from "./helpers/nullBytes.js";

// Use global to survive Next.js dev hot-reload (module state resets on reload)
if (!global._dbAdapter) global._dbAdapter = { instance: null, initPromise: null, logged: false };
const state = global._dbAdapter;

async function tryBunSqlite() {
  // Bun runtime only — built-in, no install needed
  if (typeof process === "undefined" || !process.versions?.bun) return null;
  try {
    const { createBunSqliteAdapter } = await import("./adapters/bunSqliteAdapter.js");
    return await createBunSqliteAdapter(DATA_FILE);
  } catch (e) {
    console.warn(`[DB] bun:sqlite unavailable: ${e.message}`);
    return null;
  }
}

async function tryBetterSqlite() {
  if (typeof process === "undefined" || !process.versions?.node || process.versions?.bun) return null;
  // Skip on Node >= 24: the native addon SIGSEGVs on load there, which is a
  // process-level crash the try/catch below cannot recover from. node:sqlite covers it.
  const [nodeMajor] = process.versions.node.split(".").map(Number);
  if (nodeMajor >= 24) return null;
  try {
    const { createBetterSqliteAdapter } = await import("./adapters/betterSqliteAdapter.js");
    return createBetterSqliteAdapter(DATA_FILE);
  } catch (e) {
    console.warn(`[DB] better-sqlite3 unavailable: ${e.message}`);
    return null;
  }
}

async function tryNodeSqlite() {
  if (typeof process === "undefined" || !process.versions?.node || process.versions?.bun) return null;
  const [maj, min] = process.versions.node.split(".").map(Number);
  if (maj < 22 || (maj === 22 && min < 5)) return null;
  try {
    const { createNodeSqliteAdapter } = await import("./adapters/nodeSqliteAdapter.js");
    return await createNodeSqliteAdapter(DATA_FILE);
  } catch (e) {
    console.warn(`[DB] node:sqlite unavailable: ${e.message}`);
    return null;
  }
}

async function trySqlJs() {
  try {
    const { createSqlJsAdapter } = await import("./adapters/sqljsAdapter.js");
    return await createSqlJsAdapter(DATA_FILE);
  } catch (e) {
    console.warn(`[DB] sql.js unavailable: ${e.message}`);
    return null;
  }
}

async function tryCloudflareD1() {
  if (typeof globalThis.DB !== "undefined" && typeof globalThis.DB.prepare === "function") {
    const { createD1Adapter } = await import("./adapters/d1Adapter.js");
    return createD1Adapter(globalThis.DB);
  }
  if (globalThis.__CLOUDFLARE_D1_DB__ && typeof globalThis.__CLOUDFLARE_D1_DB__.prepare === "function") {
    const { createD1Adapter } = await import("./adapters/d1Adapter.js");
    return createD1Adapter(globalThis.__CLOUDFLARE_D1_DB__);
  }
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const ctx = await getCloudflareContext({ async: true });
    const dbBinding = ctx?.env?.DB || ctx?.env?._9router_db;
    if (dbBinding && typeof dbBinding.prepare === "function") {
      const { createD1Adapter } = await import("./adapters/d1Adapter.js");
      return createD1Adapter(dbBinding);
    }
  } catch {}
  return null;
}

/**
 * Make every bound string NUL-safe, once, for all drivers.
 *
 * SQLite stores TEXT as a NUL-terminated C string, so a bound string with an
 * embedded NUL is rejected by better-sqlite3 ("String contains null byte") and
 * silently truncated by node:sqlite. Values that carry raw bytes — a model id
 * or endpoint from the request, tool output, a diff — can contain one, and the
 * write then either aborts the flush worker or loses the tail without a
 * trace. Sanitising at the binding boundary covers every driver and every
 * column type with a single rule, instead of one call site at a time.
 *
 * @param {object} adapter
 * @returns {object} adapter with NUL-safe run/get/all
 */
function withNullByteSafeParams(adapter) {
  const clean = (params) => (Array.isArray(params) ? params.map(stripNullBytes) : params);
  return {
    ...adapter,
    run: (sql, params = []) => adapter.run(sql, clean(params)),
    get: (sql, params = []) => adapter.get(sql, clean(params)),
    all: (sql, params = []) => adapter.all(sql, clean(params)),
  };
}

async function initAdapter() {
  let adapter = await tryCloudflareD1();
  if (!adapter) {
    ensureDirs();
    // Order per runtime:
    //   Bun:  bun:sqlite → sql.js
    //   Node: better-sqlite3 → node:sqlite (≥22.5) → sql.js
    adapter = await tryBunSqlite();
    if (!adapter) adapter = await tryBetterSqlite();
    if (!adapter) adapter = await tryNodeSqlite();
    if (!adapter) adapter = await trySqlJs();
  }
  if (!adapter) throw new Error("[DB] No SQLite driver available (cloudflare-d1/bun/better/node/sql.js all failed)");

  adapter = withNullByteSafeParams(adapter);

  if (!state.logged) {
    console.log(`[DB] Driver: ${adapter.driver} | ${adapter.driver === "cloudflare-d1" ? "Cloudflare D1" : "file: " + DATA_FILE}`);
    state.logged = true;
  }

  if (adapter.driver !== "cloudflare-d1") {
    const { runMigrationOnce } = await import("./migrate.js");
    await runMigrationOnce(adapter);
  }
  return adapter;
}

export async function getAdapter() {
  if (state.instance) return state.instance;
  if (!state.initPromise) state.initPromise = initAdapter().then((a) => { state.instance = a; return a; });
  return state.initPromise;
}

export function getAdapterSync() {
  if (!state.instance) throw new Error("[DB] adapter not initialized — await getAdapter() first");
  return state.instance;
}
