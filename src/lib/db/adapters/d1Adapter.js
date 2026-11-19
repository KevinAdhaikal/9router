/**
 * Cloudflare D1 Database Adapter for 9Router
 * Implements run, get, all, exec, batch, and transaction over Cloudflare D1.
 */

export function createD1Adapter(d1Db) {
  return {
    driver: "cloudflare-d1",

    async run(sql, params = []) {
      const stmt = d1Db.prepare(sql).bind(...params);
      const res = await stmt.run();
      return {
        changes: res.meta?.changes ?? 0,
        lastInsertRowid: res.meta?.last_row_id ?? null,
      };
    },

    async get(sql, params = []) {
      const stmt = d1Db.prepare(sql).bind(...params);
      const row = await stmt.first();
      return row ?? null;
    },

    async all(sql, params = []) {
      const stmt = d1Db.prepare(sql).bind(...params);
      const res = await stmt.all();
      return res.results || [];
    },

    async exec(sql) {
      return await d1Db.exec(sql);
    },

    async batch(statements) {
      const prepared = statements.map(({ sql, params = [] }) =>
        d1Db.prepare(sql).bind(...params)
      );
      return await d1Db.batch(prepared);
    },

    // Sequential operations inside transaction block against D1
    async transaction(fn) {
      return await fn();
    },

    checkpoint() {},
    close() {},
    raw: d1Db,
  };
}
