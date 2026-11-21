import { Redis } from "@upstash/redis";
import { stripNullBytes } from "../helpers/nullBytes.js";

const PREFIX = "9router:tbl:";
const IDX_PREFIX = "9router:idx:";
const SEQ_PREFIX = "9router:seq:";

function tableKey(table) {
  return `${PREFIX}${table}`;
}

function getPrimaryKey(tableName, row) {
  switch (tableName) {
    case "_meta":
      return String(row.key ?? "");
    case "settings":
      return String(row.id || "1");
    case "kv":
      return `${row.scope}:${row.key}`;
    case "usageDaily":
      return String(row.dateKey ?? "");
    default:
      return String(row.id ?? "");
  }
}

function cleanParams(params) {
  if (!Array.isArray(params)) return [];
  return params.map(stripNullBytes);
}

function parseJsonSafe(val, fallback = null) {
  if (!val) return fallback;
  if (typeof val === "object") return val;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

function matchRow(row, whereStr, params, paramOffset = 0) {
  if (!whereStr) return true;
  const conds = whereStr.split(/\s+AND\s+/i);
  let pIdx = paramOffset;

  for (const cond of conds) {
    // IS NOT NULL: col IS NOT NULL
    const isNotNullMatch = cond.match(/^([a-zA-Z0-9_]+)\s+IS\s+NOT\s+NULL$/i);
    if (isNotNullMatch) {
      const val = row[isNotNullMatch[1]];
      if (val == null || val === "") return false;
      continue;
    }

    // IN list: col IN ('a', 'b', ...)
    const inMatch = cond.match(/^([a-zA-Z0-9_]+)\s+IN\s*\(([^)]+)\)$/i);
    if (inMatch) {
      const field = inMatch[1];
      const list = inMatch[2].split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, ""));
      if (!list.includes(String(row[field] ?? ""))) return false;
      continue;
    }

    // COALESCE(col, fallback) = COALESCE(?, fallback)
    const coalesceMatch = cond.match(
      /^COALESCE\s*\(([a-zA-Z0-9_]+)\s*,\s*['"]([^'"]*)['"]\)\s*=\s*COALESCE\s*\(\?\s*,\s*['"]([^'"]*)['"]\)$/i
    );
    if (coalesceMatch) {
      const field = coalesceMatch[1];
      const fallback = coalesceMatch[2];
      const paramVal = params[pIdx++];
      const rVal = row[field] == null ? fallback : String(row[field]);
      const pVal = paramVal == null ? fallback : String(paramVal);
      if (rVal !== pVal) return false;
      continue;
    }

    // Comparison: col (=|>=|<=|LIKE) ? or literal
    const opMatch = cond.match(/^([a-zA-Z0-9_]+)\s*(=|>=|<=|LIKE)\s*(.+)$/i);
    if (opMatch) {
      const field = opMatch[1];
      const op = opMatch[2].toUpperCase();
      let targetVal = opMatch[3].trim();
      let expected;

      if (targetVal === "?") {
        expected = params[pIdx++];
      } else {
        expected = targetVal.replace(/^['"]|['"]$/g, "");
      }

      const actual = row[field];

      if (op === "=") {
        if (typeof expected === "number") {
          if (Number(actual) !== expected) return false;
        } else if (typeof expected === "boolean") {
          const actualBool = actual === 1 || actual === true || actual === "true";
          if (actualBool !== expected) return false;
        } else {
          if (String(actual ?? "") !== String(expected ?? "")) return false;
        }
      } else if (op === ">=") {
        if (typeof actual === "number" && typeof expected === "number") {
          if (actual < expected) return false;
        } else {
          if (String(actual ?? "") < String(expected ?? "")) return false;
        }
      } else if (op === "<=") {
        if (typeof actual === "number" && typeof expected === "number") {
          if (actual > expected) return false;
        } else {
          if (String(actual ?? "") > String(expected ?? "")) return false;
        }
      } else if (op === "LIKE") {
        const pat = String(expected);
        const regex = new RegExp(
          "^" +
            pat
              .replace(/([.+^=!:${}()|[\]/\\])/g, "\\$1")
              .replace(/%/g, ".*")
              .replace(/_/g, ".") +
            "$",
          "i"
        );
        if (!regex.test(String(actual ?? ""))) return false;
      }
      continue;
    }

    // Unhandled condition fallback
    console.warn("[UpstashDB] Warning: unhandled WHERE condition:", cond);
  }
  return true;
}

function sortRows(rows, orderByStr) {
  if (!orderByStr) return rows;
  const parts = orderByStr.split(",").map((p) => {
    const [field, dir] = p.trim().split(/\s+/);
    return { field, dir: dir ? dir.toUpperCase() : "ASC" };
  });

  return rows.sort((a, b) => {
    for (const { field, dir } of parts) {
      let va = a[field];
      let vb = b[field];
      if (typeof va === "number" && typeof vb === "number") {
        if (va !== vb) return dir === "DESC" ? vb - va : va - vb;
      } else {
        va = String(va ?? "");
        vb = String(vb ?? "");
        if (va < vb) return dir === "DESC" ? 1 : -1;
        if (va > vb) return dir === "DESC" ? -1 : 1;
      }
    }
    return 0;
  });
}

function projectColumns(row, colStr) {
  if (!row || typeof row !== "object") return row;
  const trimmed = colStr.trim();
  if (trimmed === "*") return { ...row };

  const out = {};
  const cols = trimmed.split(",").map((c) => c.trim());
  for (const c of cols) {
    if (row[c] !== undefined) out[c] = row[c];
  }
  return out;
}

function normalizeSql(sql) {
  if (!sql || typeof sql !== "string") return "";
  // Translate PostgreSQL $1, $2 placeholders to ? if present
  return sql.replace(/\$\d+/g, "?").trim();
}

export function createUpstashRedisAdapter(redisClient) {
  const redis =
    redisClient instanceof Redis
      ? redisClient
      : new Redis({
          url:
            (typeof redisClient === "object" ? redisClient?.url : null) ||
            process.env.KV_REST_API_URL ||
            process.env.UPSTASH_REDIS_REST_URL,
          token:
            (typeof redisClient === "object" ? redisClient?.token : null) ||
            process.env.KV_REST_API_TOKEN ||
            process.env.UPSTASH_REDIS_REST_TOKEN,
        });

  const SELECT_REGEX =
    /^\s*SELECT\s+(.+?)\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+(.+?))?(?:\s+ORDER\s+BY\s+(.+?))?(?:\s+LIMIT\s+(\d+|\?))?(?:\s+OFFSET\s+(\d+|\?))?\s*$/i;
  const INSERT_REGEX =
    /^\s*INSERT\s+INTO\s+([a-zA-Z0-9_]+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)(?:\s+ON\s+CONFLICT.*)?$/i;
  const UPDATE_REGEX =
    /^\s*UPDATE\s+([a-zA-Z0-9_]+)\s+SET\s+(.+?)\s+WHERE\s+(.+)$/i;
  const DELETE_REGEX =
    /^\s*DELETE\s+FROM\s+([a-zA-Z0-9_]+)(?:\s+WHERE\s+(.+))?$/i;

  async function getAllTableRows(tableName) {
    const tbl = tableKey(tableName);
    const rawMap = await redis.hgetall(tbl);
    if (!rawMap || typeof rawMap !== "object") return [];
    const rows = [];
    for (const val of Object.values(rawMap)) {
      const parsed = parseJsonSafe(val);
      if (parsed) rows.push(parsed);
    }
    return rows;
  }

  async function executeSelect(sql, rawParams = []) {
    const params = cleanParams(rawParams);
    const m = sql.match(SELECT_REGEX);
    if (!m) {
      // Check for information_schema query
      if (/information_schema/i.test(sql)) {
        return [];
      }
      console.warn("[UpstashDB] SELECT query not matched by standard regex:", sql);
      return [];
    }

    const colStr = m[1].trim();
    const tableName = m[2];
    const whereStr = m[3] ? m[3].trim() : null;
    const orderStr = m[4] ? m[4].trim() : null;
    let limitStr = m[5] ? m[5].trim() : null;
    let offsetStr = m[6] ? m[6].trim() : null;

    let paramIdx = 0;

    // Fast-path 1: Point lookups by primary key
    if (whereStr === "id = ?" && tableName !== "usageHistory") {
      const id = String(params[paramIdx++]);
      const raw = await redis.hget(tableKey(tableName), id);
      const row = parseJsonSafe(raw);
      if (!row) return [];
      return [projectColumns(row, colStr)];
    }

    if (whereStr === "id = 1" && tableName === "settings") {
      const raw = await redis.hget(tableKey("settings"), "1");
      const row = parseJsonSafe(raw);
      if (!row) return [];
      return [projectColumns(row, colStr)];
    }

    if (whereStr === "key = ?" && tableName === "_meta") {
      const key = String(params[paramIdx++]);
      const raw = await redis.hget(tableKey("_meta"), key);
      const row = parseJsonSafe(raw);
      if (!row) return [];
      return [projectColumns(row, colStr)];
    }

    if (whereStr === "dateKey = ?" && tableName === "usageDaily") {
      const key = String(params[paramIdx++]);
      const raw = await redis.hget(tableKey("usageDaily"), key);
      const row = parseJsonSafe(raw);
      if (!row) return [];
      return [projectColumns(row, colStr)];
    }

    if (whereStr === "scope = ? AND key = ?" && tableName === "kv") {
      const scope = String(params[paramIdx++]);
      const key = String(params[paramIdx++]);
      const raw = await redis.hget(tableKey("kv"), `${scope}:${key}`);
      const row = parseJsonSafe(raw);
      if (!row) return [];
      return [projectColumns(row, colStr)];
    }

    if (whereStr === "key = ?" && tableName === "apiKeys") {
      const key = String(params[paramIdx++]);
      const id = await redis.hget(`${IDX_PREFIX}apiKeys:key`, key);
      if (!id) return [];
      const raw = await redis.hget(tableKey("apiKeys"), String(id));
      const row = parseJsonSafe(raw);
      if (!row) return [];
      return [projectColumns(row, colStr)];
    }

    if (whereStr === "name = ?" && tableName === "combos") {
      const name = String(params[paramIdx++]);
      const id = await redis.hget(`${IDX_PREFIX}combos:name`, name);
      if (!id) return [];
      const raw = await redis.hget(tableKey("combos"), String(id));
      const row = parseJsonSafe(raw);
      if (!row) return [];
      return [projectColumns(row, colStr)];
    }

    // Fast-path 2: COUNT(*) without WHERE
    if (/^COUNT\(\*\)/i.test(colStr) && !whereStr) {
      const count = (await redis.hlen(tableKey(tableName))) || 0;
      return [{ c: count, n: count, count }];
    }

    // General query path: Fetch rows, filter, sort, slice, project
    let rows = await getAllTableRows(tableName);

    // Filter with WHERE
    if (whereStr) {
      rows = rows.filter((r) => matchRow(r, whereStr, params, paramIdx));
    }

    // Special aggregation 1: COUNT(*) with WHERE
    if (/^COUNT\(\*\)/i.test(colStr)) {
      return [{ c: rows.length, n: rows.length, count: rows.length }];
    }

    // Special aggregation 2: MAX(priority)
    if (/^MAX\(/i.test(colStr)) {
      const maxColMatch = colStr.match(/MAX\(([a-zA-Z0-9_]+)\)/i);
      const col = maxColMatch ? maxColMatch[1] : "priority";
      let maxVal = null;
      for (const r of rows) {
        const v = Number(r[col]);
        if (!isNaN(v) && (maxVal === null || v > maxVal)) {
          maxVal = v;
        }
      }
      return [{ m: maxVal, max: maxVal }];
    }

    // Special aggregation 3: DISTINCT provider
    if (/^DISTINCT\s+([a-zA-Z0-9_]+)/i.test(colStr)) {
      const field = colStr.match(/^DISTINCT\s+([a-zA-Z0-9_]+)/i)[1];
      const seen = new Set();
      const distinctRows = [];
      for (const r of rows) {
        const val = r[field];
        if (val != null && !seen.has(val)) {
          seen.add(val);
          distinctRows.push({ [field]: val });
        }
      }
      distinctRows.sort((a, b) => String(a[field]).localeCompare(String(b[field])));
      return distinctRows;
    }

    // Order by
    if (orderStr) {
      rows = sortRows(rows, orderStr);
    }

    // Limit and Offset
    let limit = null;
    let offset = 0;
    if (limitStr) {
      limit = limitStr === "?" ? Number(params[paramIdx++]) : parseInt(limitStr, 10);
    }
    if (offsetStr) {
      offset = offsetStr === "?" ? Number(params[paramIdx++]) : parseInt(offsetStr, 10);
    }

    if (limit !== null || offset > 0) {
      const end = limit !== null ? offset + limit : undefined;
      rows = rows.slice(offset, end);
    }

    // Project columns
    return rows.map((r) => projectColumns(r, colStr));
  }

  async function executeInsert(sql, rawParams = []) {
    const params = cleanParams(rawParams);
    const m = sql.match(INSERT_REGEX);
    if (!m) {
      throw new Error(`[UpstashDB] Unrecognized INSERT query: ${sql}`);
    }

    const tableName = m[1];
    const colNames = m[2].split(",").map((c) => c.trim());
    const valPlaceholders = m[3].split(",").map((v) => v.trim());

    const row = {};
    let pIdx = 0;
    for (let i = 0; i < colNames.length; i++) {
      const col = colNames[i];
      const placeholder = valPlaceholders[i];
      if (placeholder === "?") {
        row[col] = params[pIdx++];
      } else {
        row[col] = placeholder.replace(/^['"]|['"]$/g, "");
      }
    }

    // Auto-generate auto-increment id for usageHistory if absent
    if (tableName === "usageHistory" && (row.id == null || row.id === "")) {
      row.id = await redis.incr(`${SEQ_PREFIX}usageHistory`);
    }

    const pk = getPrimaryKey(tableName, row);
    const tbl = tableKey(tableName);

    // Merge existing row if ON CONFLICT DO UPDATE
    if (/ON\s+CONFLICT/i.test(sql)) {
      const existingRaw = await redis.hget(tbl, pk);
      const existing = parseJsonSafe(existingRaw);
      if (existing) {
        Object.assign(existing, row);
        await redis.hset(tbl, { [pk]: JSON.stringify(existing) });
        return { changes: 1, lastInsertRowid: row.id ?? null };
      }
    }

    await redis.hset(tbl, { [pk]: JSON.stringify(row) });

    // Update secondary indexes
    if (tableName === "apiKeys" && row.key) {
      await redis.hset(`${IDX_PREFIX}apiKeys:key`, { [String(row.key)]: String(row.id) });
    }
    if (tableName === "combos" && row.name) {
      await redis.hset(`${IDX_PREFIX}combos:name`, { [String(row.name)]: String(row.id) });
    }

    return { changes: 1, lastInsertRowid: row.id ?? null };
  }

  async function executeUpdate(sql, rawParams = []) {
    const params = cleanParams(rawParams);
    const m = sql.match(UPDATE_REGEX);
    if (!m) {
      throw new Error(`[UpstashDB] Unrecognized UPDATE query: ${sql}`);
    }

    const tableName = m[1];
    const setStr = m[2].trim();
    const whereStr = m[3].trim();

    // Parse SET assignments
    const assignments = setStr.split(",").map((a) => a.trim());
    let pIdx = 0;
    const updates = {};
    for (const a of assignments) {
      const [col, valExpr] = a.split("=").map((s) => s.trim());
      if (valExpr === "?") {
        updates[col] = params[pIdx++];
      } else {
        updates[col] = valExpr.replace(/^['"]|['"]$/g, "");
      }
    }

    const tbl = tableKey(tableName);

    // Fast-path: UPDATE ... WHERE id = ?
    if (whereStr === "id = ?") {
      const id = String(params[pIdx++]);
      const raw = await redis.hget(tbl, id);
      const row = parseJsonSafe(raw);
      if (!row) return { changes: 0, lastInsertRowid: null };

      const oldKey = row.key;
      const oldName = row.name;

      Object.assign(row, updates);
      await redis.hset(tbl, { [id]: JSON.stringify(row) });

      // Update secondary indexes if changed
      if (tableName === "apiKeys") {
        if (oldKey && oldKey !== row.key) {
          await redis.hdel(`${IDX_PREFIX}apiKeys:key`, oldKey);
        }
        if (row.key) {
          await redis.hset(`${IDX_PREFIX}apiKeys:key`, { [String(row.key)]: id });
        }
      }
      if (tableName === "combos") {
        if (oldName && oldName !== row.name) {
          await redis.hdel(`${IDX_PREFIX}combos:name`, oldName);
        }
        if (row.name) {
          await redis.hset(`${IDX_PREFIX}combos:name`, { [String(row.name)]: id });
        }
      }

      return { changes: 1, lastInsertRowid: null };
    }

    // General UPDATE path: scan and update matching rows
    const allRows = await getAllTableRows(tableName);
    let changed = 0;
    for (const row of allRows) {
      if (matchRow(row, whereStr, params, pIdx)) {
        Object.assign(row, updates);
        const pk = getPrimaryKey(tableName, row);
        await redis.hset(tbl, { [pk]: JSON.stringify(row) });
        changed++;
      }
    }

    return { changes: changed, lastInsertRowid: null };
  }

  async function executeDelete(sql, rawParams = []) {
    const params = cleanParams(rawParams);
    const m = sql.match(DELETE_REGEX);
    if (!m) {
      throw new Error(`[UpstashDB] Unrecognized DELETE query: ${sql}`);
    }

    const tableName = m[1];
    const whereStr = m[2] ? m[2].trim() : null;
    const tbl = tableKey(tableName);

    // 1. DELETE FROM table (wipe all)
    if (!whereStr) {
      await redis.del(tbl);
      if (tableName === "apiKeys") await redis.del(`${IDX_PREFIX}apiKeys:key`);
      if (tableName === "combos") await redis.del(`${IDX_PREFIX}combos:name`);
      return { changes: 1, lastInsertRowid: null };
    }

    let pIdx = 0;

    // 2. DELETE FROM table WHERE id = ?
    if (whereStr === "id = ?") {
      const id = String(params[pIdx++]);
      const raw = await redis.hget(tbl, id);
      const row = parseJsonSafe(raw);
      await redis.hdel(tbl, id);
      if (tableName === "apiKeys" && row?.key) {
        await redis.hdel(`${IDX_PREFIX}apiKeys:key`, String(row.key));
      }
      if (tableName === "combos" && row?.name) {
        await redis.hdel(`${IDX_PREFIX}combos:name`, String(row.name));
      }
      return { changes: row ? 1 : 0, lastInsertRowid: null };
    }

    // 3. DELETE FROM kv WHERE scope = ? AND key = ?
    if (whereStr === "scope = ? AND key = ?" && tableName === "kv") {
      const scope = String(params[pIdx++]);
      const key = String(params[pIdx++]);
      const pk = `${scope}:${key}`;
      const deleted = await redis.hdel(tbl, pk);
      return { changes: deleted ? 1 : 0, lastInsertRowid: null };
    }

    // 4. Special FIFO cleanup: DELETE FROM requestDetails WHERE id IN (SELECT id FROM requestDetails ORDER BY timestamp ASC LIMIT ?)
    if (/SELECT id FROM requestDetails ORDER BY timestamp ASC LIMIT \?/i.test(whereStr)) {
      const limit = Number(params[pIdx++]);
      if (limit <= 0) return { changes: 0, lastInsertRowid: null };
      const rows = await getAllTableRows(tableName);
      sortRows(rows, "timestamp ASC");
      const victims = rows.slice(0, limit);
      if (victims.length > 0) {
        const victimIds = victims.map((r) => String(r.id));
        await redis.hdel(tbl, ...victimIds);
      }
      return { changes: victims.length, lastInsertRowid: null };
    }

    // 5. General DELETE path: scan, filter, delete matching
    const allRows = await getAllTableRows(tableName);
    const toDelete = [];
    for (const row of allRows) {
      if (matchRow(row, whereStr, params, pIdx)) {
        toDelete.push(row);
      }
    }

    if (toDelete.length > 0) {
      const pks = toDelete.map((r) => getPrimaryKey(tableName, r));
      await redis.hdel(tbl, ...pks);

      // Clean secondary indexes
      if (tableName === "apiKeys") {
        for (const r of toDelete) {
          if (r.key) await redis.hdel(`${IDX_PREFIX}apiKeys:key`, String(r.key));
        }
      }
      if (tableName === "combos") {
        for (const r of toDelete) {
          if (r.name) await redis.hdel(`${IDX_PREFIX}combos:name`, String(r.name));
        }
      }
    }

    return { changes: toDelete.length, lastInsertRowid: null };
  }

  return {
    driver: "upstash-redis",
    raw: redis,

    async run(sql, params = []) {
      const trimmed = normalizeSql(sql);
      if (/^INSERT/i.test(trimmed)) {
        return await executeInsert(trimmed, params);
      } else if (/^UPDATE/i.test(trimmed)) {
        return await executeUpdate(trimmed, params);
      } else if (/^DELETE/i.test(trimmed)) {
        return await executeDelete(trimmed, params);
      }
      return { changes: 0, lastInsertRowid: null };
    },

    async get(sql, params = []) {
      const rows = await executeSelect(normalizeSql(sql), params);
      return rows && rows.length > 0 ? rows[0] : null;
    },

    async all(sql, params = []) {
      return await executeSelect(normalizeSql(sql), params);
    },

    async exec(sql) {
      const statements = sql
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean);

      for (const stmt of statements) {
        // DDL commands (CREATE TABLE, CREATE INDEX, ALTER TABLE) are no-ops in Redis
        if (/^(CREATE|ALTER|DROP)/i.test(stmt)) {
          continue;
        }
        await this.run(stmt);
      }
      return { changes: 0 };
    },

    async transaction(fn) {
      return await fn();
    },

    async close() {
      // Redis over HTTP has no long-lived connection pool to close
    },
  };
}
