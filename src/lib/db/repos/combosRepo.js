import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";

function rowToCombo(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    models: parseJson(row.models, []),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

let _combosCache = null;
let _combosCacheExpiresAt = 0;
const COMBO_CACHE_TTL_MS = 30_000; // 30s

export function invalidateCombosCache() {
  _combosCache = null;
  _combosCacheExpiresAt = 0;
}

export async function getCombos() {
  const now = Date.now();
  if (_combosCache && now < _combosCacheExpiresAt) {
    return _combosCache;
  }
  const db = await getAdapter();
  const rows = await db.all(`SELECT * FROM combos ORDER BY createdAt ASC`);
  const list = rows.map(rowToCombo);
  _combosCache = list;
  _combosCacheExpiresAt = now + COMBO_CACHE_TTL_MS;
  return list;
}

export async function getComboById(id) {
  const combos = await getCombos();
  return combos.find((c) => c.id === id) || null;
}

export async function getComboByName(name) {
  if (!name) return null;
  const combos = await getCombos();
  const lower = name.toLowerCase();
  return combos.find((c) => c.name && c.name.toLowerCase() === lower) || null;
}

export async function createCombo(data) {
  const db = await getAdapter();
  const now = new Date().toISOString();
  const combo = {
    id: uuidv4(),
    name: data.name,
    kind: data.kind || null,
    models: data.models || [],
    createdAt: now,
    updatedAt: now,
  };
  await db.run(
    `INSERT INTO combos(id, name, kind, models, createdAt, updatedAt) VALUES(?, ?, ?, ?, ?, ?)`,
    [combo.id, combo.name, combo.kind, stringifyJson(combo.models), combo.createdAt, combo.updatedAt]
  );
  invalidateCombosCache();
  return combo;
}

export async function updateCombo(id, data) {
  const db = await getAdapter();
  let result = null;
  await db.transaction(async () => {
    const row = await db.get(`SELECT * FROM combos WHERE id = ?`, [id]);
    if (!row) return;
    const merged = { ...rowToCombo(row), ...data, updatedAt: new Date().toISOString() };
    await db.run(
      `UPDATE combos SET name = ?, kind = ?, models = ?, updatedAt = ? WHERE id = ?`,
      [merged.name, merged.kind, stringifyJson(merged.models || []), merged.updatedAt, id]
    );
    result = merged;
  });
  invalidateCombosCache();
  return result;
}

export async function deleteCombo(id) {
  const db = await getAdapter();
  const res = await db.run(`DELETE FROM combos WHERE id = ?`, [id]);
  invalidateCombosCache();
  return (res?.changes ?? 0) > 0;
}
