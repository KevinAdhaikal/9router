import { Pool } from "@neondatabase/serverless";
import { AsyncLocalStorage } from "node:async_hooks";
import { stripNullBytes } from "../helpers/nullBytes.js";

// Storage to track active transaction across async calls
const txStorage = new AsyncLocalStorage();

// Known camelCase column mapping for PostgreSQL lowercase field normalization
const COLUMN_MAP = {
  authtype: "authType",
  isactive: "isActive",
  createdat: "createdAt",
  updatedat: "updatedAt",
  machineid: "machineId",
  accessrestricted: "accessRestricted",
  accessallow: "accessAllow",
  connectionid: "connectionId",
  apikey: "apiKey",
  prompttokens: "promptTokens",
  completiontokens: "completionTokens",
  datekey: "dateKey",
  teststatus: "testStatus",
  lasttested: "lastTested",
  lasterror: "lastError",
  lasterrorat: "lastErrorAt",
  ratelimiteduntil: "rateLimitedUntil",
  expiresin: "expiresIn",
  errorcode: "errorCode",
  consecutiveusecount: "consecutiveUseCount",
  idtoken: "idToken",
  lastrefreshat: "lastRefreshAt",
  accesstoken: "accessToken",
  refreshtoken: "refreshToken",
  expiresat: "expiresAt",
  tokentype: "tokenType",
  projectid: "projectId",
  defaultmodel: "defaultModel",
  displayname: "displayName",
  strictproxy: "strictProxy",
  lasttestedat: "lastTestedAt",
  apitype: "apiType",
  baseurl: "baseUrl",
};

/**
 * Normalizes PostgreSQL row keys so camelCase properties expected by 9router
 * are populated consistently.
 */
export function normalizeRow(row) {
  if (!row || typeof row !== "object") return row;
  const out = {};
  for (const [key, value] of Object.entries(row)) {
    out[key] = value;
    const lower = key.toLowerCase();
    if (COLUMN_MAP[lower] && COLUMN_MAP[lower] !== key) {
      out[COLUMN_MAP[lower]] = value;
    }
  }
  return out;
}

/**
 * Translates SQLite '?' parameter placeholders to PostgreSQL '$1, $2, ...'
 * while preserving literal question marks inside quotes.
 */
export function translatePlaceholders(sql) {
  if (!sql || typeof sql !== "string") return sql;
  let paramIndex = 1;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let result = "";

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    const prev = i > 0 ? sql[i - 1] : "";

    if (char === "'" && prev !== "\\") {
      inSingleQuote = !inSingleQuote;
      result += char;
    } else if (char === '"' && prev !== "\\") {
      inDoubleQuote = !inDoubleQuote;
      result += char;
    } else if (char === "?" && !inSingleQuote && !inDoubleQuote) {
      result += `$${paramIndex++}`;
    } else {
      result += char;
    }
  }
  return result;
}

function cleanParams(params) {
  if (!Array.isArray(params)) return [];
  return params.map(stripNullBytes);
}

export function createNeonAdapter(connectionString) {
  const pool = new Pool({ connectionString });

  async function execute(sql, params = []) {
    const translatedSql = translatePlaceholders(sql);
    const cleaned = cleanParams(params);
    const activeTx = txStorage.getStore();
    const executor = activeTx || pool;
    return await executor.query(translatedSql, cleaned);
  }

  return {
    driver: "neon",
    raw: pool,

    async run(sql, params = []) {
      const res = await execute(sql, params);
      return {
        changes: Number(res.rowCount ?? 0),
        lastInsertRowid: null,
      };
    },

    async get(sql, params = []) {
      const res = await execute(sql, params);
      const row = res.rows && res.rows.length > 0 ? res.rows[0] : null;
      return normalizeRow(row);
    },

    async all(sql, params = []) {
      const res = await execute(sql, params);
      if (!res.rows) return [];
      return res.rows.map(normalizeRow);
    },

    async exec(sql) {
      const activeTx = txStorage.getStore();
      const executor = activeTx || pool;
      return await executor.query(sql);
    },

    async transaction(fn) {
      const parentTx = txStorage.getStore();
      if (parentTx) {
        // Already inside a transaction, run within existing context
        return await fn();
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await txStorage.run(client, async () => {
          return await fn();
        });
        await client.query("COMMIT");
        return result;
      } catch (err) {
        try { await client.query("ROLLBACK"); } catch {}
        throw err;
      } finally {
        client.release();
      }
    },

    async close() {
      try {
        await pool.end();
      } catch {}
    },
  };
}
