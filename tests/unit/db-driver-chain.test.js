// Verify Neon PostgreSQL driver behavior
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const originalDbUrl = process.env.DATABASE_URL;
const originalPostgresUrl = process.env.POSTGRES_URL;

beforeEach(() => {
  delete global._dbAdapter;
  delete process.env.DATABASE_URL;
  delete process.env.POSTGRES_URL;
  vi.resetModules();
});

afterEach(() => {
  try { global._dbAdapter?.instance?.close?.(); } catch {}
  delete global._dbAdapter;
  if (originalDbUrl !== undefined) process.env.DATABASE_URL = originalDbUrl;
  else delete process.env.DATABASE_URL;
  if (originalPostgresUrl !== undefined) process.env.POSTGRES_URL = originalPostgresUrl;
  else delete process.env.POSTGRES_URL;
});

describe("Neon PostgreSQL Driver", () => {
  it("throws descriptive error when neither DATABASE_URL nor POSTGRES_URL is configured", async () => {
    const { getAdapter } = await import("@/lib/db/driver.js");
    await expect(getAdapter()).rejects.toThrow(/Missing DATABASE_URL or POSTGRES_URL/);
  });

  it("reads getDatabaseUrl correctly from DATABASE_URL or POSTGRES_URL", async () => {
    const { getDatabaseUrl } = await import("@/lib/db/driver.js");
    process.env.DATABASE_URL = "postgres://user:pass@host/db";
    expect(getDatabaseUrl()).toBe("postgres://user:pass@host/db");

    delete process.env.DATABASE_URL;
    process.env.POSTGRES_URL = "postgres://user2:pass2@host2/db2";
    expect(getDatabaseUrl()).toBe("postgres://user2:pass2@host2/db2");
  });
});
