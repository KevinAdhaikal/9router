import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "./jsonCol.js";

const KV_CACHE_TTL_MS = 30_000; // 30s

export function makeKv(scope) {
  let cache = null;
  let cacheExpiresAt = 0;

  function invalidate() {
    cache = null;
    cacheExpiresAt = 0;
  }

  return {
    async get(key, fallback = null) {
      const all = await this.getAll();
      return all[key] !== undefined ? all[key] : fallback;
    },
    async getAll() {
      const now = Date.now();
      if (cache && now < cacheExpiresAt) {
        return cache;
      }
      const db = await getAdapter();
      const rows = await db.all(`SELECT key, value FROM kv WHERE scope = ?`, [scope]);
      const out = {};
      for (const r of rows) out[r.key] = parseJson(r.value);
      cache = out;
      cacheExpiresAt = now + KV_CACHE_TTL_MS;
      return out;
    },
    async set(key, value) {
      const db = await getAdapter();
      await db.run(
        `INSERT INTO kv(scope, key, value) VALUES(?, ?, ?) ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value`,
        [scope, key, stringifyJson(value)]
      );
      invalidate();
    },
    async setMany(obj) {
      const db = await getAdapter();
      await db.transaction(async () => {
        for (const [k, v] of Object.entries(obj)) {
          await db.run(
            `INSERT INTO kv(scope, key, value) VALUES(?, ?, ?) ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value`,
            [scope, k, stringifyJson(v)]
          );
        }
      });
      invalidate();
    },
    async remove(key) {
      const db = await getAdapter();
      await db.run(`DELETE FROM kv WHERE scope = ? AND key = ?`, [scope, key]);
      invalidate();
    },
    async clear() {
      const db = await getAdapter();
      await db.run(`DELETE FROM kv WHERE scope = ?`, [scope]);
      invalidate();
    },
  };
}
