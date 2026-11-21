import { v4 as uuidv4 } from "uuid";
import { getAdapter } from "../driver.js";
import { parseJson, stringifyJson } from "../helpers/jsonCol.js";
import { createMemoryCache } from "../helpers/cache.js";

const comboCache = createMemoryCache(60000);

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

export async function getCombos() {
  const cached = comboCache.get("all");
  if (cached) return cached;
  const db = await getAdapter();
  const rows = await db.all(`SELECT * FROM combos ORDER BY createdAt ASC`);
  const result = rows.map(rowToCombo);
  comboCache.set("all", result);
  return result;
}

export async function getComboById(id) {
  if (!id) return null;
  const cached = comboCache.get(`id:${id}`);
  if (cached) return cached;
  const db = await getAdapter();
  const row = await db.get(`SELECT * FROM combos WHERE id = ?`, [id]);
  const result = rowToCombo(row);
  if (result) comboCache.set(`id:${id}`, result);
  return result;
}

export async function getComboByName(name) {
  if (!name) return null;
  const cached = comboCache.get(`name:${name}`);
  if (cached) return cached;
  const db = await getAdapter();
  const row = await db.get(`SELECT * FROM combos WHERE name = ?`, [name]);
  const result = rowToCombo(row);
  if (result) comboCache.set(`name:${name}`, result);
  return result;
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
  comboCache.clear();
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
  comboCache.clear();
  return result;
}

export async function deleteCombo(id) {
  const db = await getAdapter();
  const res = await db.run(`DELETE FROM combos WHERE id = ?`, [id]);
  comboCache.clear();
  return (res?.changes ?? 0) > 0;
}
