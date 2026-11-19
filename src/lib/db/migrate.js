import { TABLES, buildCreateTableSql, SCHEMA_VERSION } from "./schema.js";
import { getAppVersion } from "./version.js";

const _migratedAdapters = new WeakSet();

async function getMeta(adapter, key, fallback = null) {
  try {
    const row = await adapter.get("SELECT value FROM _meta WHERE key = $1", [key]);
    return row ? row.value : fallback;
  } catch {
    return fallback;
  }
}

async function setMeta(adapter, key, value) {
  await adapter.run(
    "INSERT INTO _meta(key, value) VALUES($1, $2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [key, String(value)]
  );
}

/**
 * Ensures all tables, columns, and indexes defined in TABLES exist in PostgreSQL.
 */
async function syncSchemaFromTables(adapter) {
  for (const [tableName, def] of Object.entries(TABLES)) {
    // 1. Create table if absent
    await adapter.exec(buildCreateTableSql(tableName, def));

    // 2. Diff columns using information_schema.columns
    try {
      const rows = await adapter.all(
        "SELECT column_name FROM information_schema.columns WHERE lower(table_name) = lower($1)",
        [tableName]
      );
      const existingNames = new Set(rows.map((r) => String(r.column_name || "").toLowerCase()));

      for (const [colName, colDef] of Object.entries(def.columns)) {
        if (!existingNames.has(colName.toLowerCase())) {
          const safeDef = colDef
            .replace(/PRIMARY KEY( AUTOINCREMENT)?/i, "")
            .replace(/SERIAL/i, "INTEGER")
            .replace(/UNIQUE/i, "")
            .trim();
          try {
            await adapter.exec(`ALTER TABLE ${tableName} ADD COLUMN "${colName}" ${safeDef}`);
            console.log(`[DB][sync] +column ${tableName}.${colName}`);
          } catch (e) {
            console.warn(`[DB][sync] add column ${tableName}.${colName} failed: ${e.message}`);
          }
        }
      }
    } catch (e) {
      console.warn(`[DB][sync] failed checking columns for ${tableName}:`, e.message);
    }

    // 3. Create indexes (idempotent with IF NOT EXISTS)
    for (const idx of def.indexes || []) {
      try {
        await adapter.exec(idx);
      } catch (err) {
        // Some indexes might already exist
      }
    }
  }
}

export async function runMigrationOnce(adapter) {
  if (_migratedAdapters.has(adapter)) return;
  _migratedAdapters.add(adapter);

  // 1. Bootstrap _meta table first
  await adapter.exec(buildCreateTableSql("_meta", TABLES._meta));

  // 2. Synchronize tables, columns, and indexes
  await syncSchemaFromTables(adapter);

  // 3. Update meta versions
  await setMeta(adapter, "schemaVersion", SCHEMA_VERSION);
  const appVer = getAppVersion();
  await setMeta(adapter, "appVersion", appVer);
  await setMeta(adapter, "migratedAt", new Date().toISOString());

  console.log(`[DB][migrate] Neon PostgreSQL schema synced (schema v${SCHEMA_VERSION}, app v${appVer})`);
}
