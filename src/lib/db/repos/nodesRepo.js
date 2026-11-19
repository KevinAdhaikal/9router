import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";

function rowToNode(row) {
  if (!row) return null;
  const extra = parseJson(row.data, {});
  return {
    ...extra,
    id: row.id,
    type: row.type,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function nodeToRow(n) {
  const { id, type, name, createdAt, updatedAt, ...rest } = n;
  return {
    id,
    type: type ?? null,
    name: name ?? null,
    data: stringifyJson(rest),
    createdAt,
    updatedAt,
  };
}

async function upsert(db, n) {
  const r = nodeToRow(n);
  await db.run(
    `INSERT INTO providerNodes(id, type, name, data, createdAt, updatedAt)
     VALUES(?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       type=excluded.type, name=excluded.name, data=excluded.data, updatedAt=excluded.updatedAt`,
    [r.id, r.type, r.name, r.data, r.createdAt, r.updatedAt]
  );
}

let _nodesCache = null;
let _nodesCacheExpiresAt = 0;
const NODES_CACHE_TTL_MS = 60_000; // 60s

export function invalidateNodesCache() {
  _nodesCache = null;
  _nodesCacheExpiresAt = 0;
}

export async function getProviderNodes(filter = {}) {
  const now = Date.now();
  let list = _nodesCache;
  if (!list || now >= _nodesCacheExpiresAt) {
    const db = await getAdapter();
    const rows = await db.all(`SELECT * FROM providerNodes`);
    list = rows.map(rowToNode);
    _nodesCache = list;
    _nodesCacheExpiresAt = now + NODES_CACHE_TTL_MS;
  }
  return list.filter((n) => {
    if (filter.type && n.type !== filter.type) return false;
    return true;
  });
}

export async function getProviderNodeById(id) {
  if (!id) return null;
  const nodes = await getProviderNodes();
  return nodes.find((n) => n.id === id) || null;
}

export async function createProviderNode(data) {
  const db = await getAdapter();
  const now = new Date().toISOString();
  const node = {
    id: data.id || uuidv4(),
    type: data.type,
    name: data.name,
    prefix: data.prefix,
    apiType: data.apiType,
    baseUrl: data.baseUrl,
    createdAt: now,
    updatedAt: now,
  };
  await upsert(db, node);
  invalidateNodesCache();
  return node;
}

export async function updateProviderNode(id, data) {
  const db = await getAdapter();
  let result = null;
  await db.transaction(async () => {
    const row = await db.get(`SELECT * FROM providerNodes WHERE id = ?`, [id]);
    if (!row) return;
    const merged = { ...rowToNode(row), ...data, updatedAt: new Date().toISOString() };
    await upsert(db, merged);
    result = merged;
  });
  invalidateNodesCache();
  return result;
}

export async function deleteProviderNode(id) {
  const db = await getAdapter();
  let removed = null;
  await db.transaction(async () => {
    const row = await db.get(`SELECT * FROM providerNodes WHERE id = ?`, [id]);
    if (!row) return;
    removed = rowToNode(row);
    await db.run(`DELETE FROM providerNodes WHERE id = ?`, [id]);
    await db.run(`DELETE FROM kv WHERE scope = 'customModels' AND key LIKE ?`, [`${id}|%`]);
  });
  invalidateNodesCache();
  return removed;
}
