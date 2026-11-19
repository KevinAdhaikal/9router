import { describe, it, expect } from "vitest";
import { translatePlaceholders, normalizeRow } from "@/lib/db/adapters/neonAdapter.js";

describe("Neon Adapter - SQL Placeholder Translator", () => {
  it("translates single ? into $1", () => {
    const input = "SELECT * FROM users WHERE id = ?";
    expect(translatePlaceholders(input)).toBe("SELECT * FROM users WHERE id = $1");
  });

  it("translates multiple ? into sequential $1, $2, $3", () => {
    const input = "INSERT INTO table(a, b, c) VALUES(?, ?, ?)";
    expect(translatePlaceholders(input)).toBe("INSERT INTO table(a, b, c) VALUES($1, $2, $3)");
  });

  it("ignores ? inside single quoted string literals", () => {
    const input = "SELECT * FROM tbl WHERE title = 'What is this?' AND id = ?";
    expect(translatePlaceholders(input)).toBe("SELECT * FROM tbl WHERE title = 'What is this?' AND id = $1");
  });

  it("ignores ? inside double quoted identifiers", () => {
    const input = 'SELECT * FROM "strange?col" WHERE id = ?';
    expect(translatePlaceholders(input)).toBe('SELECT * FROM "strange?col" WHERE id = $1');
  });

  it("handles complex UPSERT queries with ON CONFLICT", () => {
    const input = `INSERT INTO providerConnections(id, provider, authType, data) VALUES(?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET provider=excluded.provider, data=excluded.data`;
    expect(translatePlaceholders(input)).toBe(
      `INSERT INTO providerConnections(id, provider, authType, data) VALUES($1, $2, $3, $4) ON CONFLICT(id) DO UPDATE SET provider=excluded.provider, data=excluded.data`
    );
  });
});

describe("Neon Adapter - Row Normalization", () => {
  it("normalizes lowercase column names to expected camelCase", () => {
    const rawPgRow = {
      id: "conn-123",
      provider: "openai",
      authtype: "apikey",
      isactive: 1,
      createdat: "2026-11-17T00:00:00.000Z",
      prompttokens: 150,
      completiontokens: 75,
      datekey: "2026-11-17",
    };

    const normalized = normalizeRow(rawPgRow);

    expect(normalized.authType).toBe("apikey");
    expect(normalized.isActive).toBe(1);
    expect(normalized.createdAt).toBe("2026-11-17T00:00:00.000Z");
    expect(normalized.promptTokens).toBe(150);
    expect(normalized.completionTokens).toBe(75);
    expect(normalized.dateKey).toBe("2026-11-17");
    // Also retains original lowercase properties for compatibility
    expect(normalized.authtype).toBe("apikey");
    expect(normalized.isactive).toBe(1);
  });

  it("handles null or undefined row cleanly", () => {
    expect(normalizeRow(null)).toBeNull();
    expect(normalizeRow(undefined)).toBeUndefined();
  });
});
