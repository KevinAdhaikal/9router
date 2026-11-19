// Resolve a writable data directory: DATA_DIR first, then ~/.9router, then
// tmpdir. Some installs point DATA_DIR at root-owned paths (e.g. /var/lib) that
// the server process cannot write browser profiles or runtime installs into.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let cached = null;

export function getWritableDataDir() {
  if (cached) return cached;
  const isServerless = !!(
    process.env.NETLIFY ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.VERCEL
  );
  const candidates = [
    process.env.DATA_DIR,
    isServerless ? path.join(os.tmpdir(), "9router") : null,
    path.join(os.homedir(), ".9router"),
    path.join(os.tmpdir(), "9router"),
    path.join("/tmp", "9router"),
  ].filter(Boolean);
  for (const base of candidates) {
    try {
      fs.mkdirSync(base, { recursive: true });
      fs.accessSync(base, fs.constants.W_OK);
      const testFile = path.join(base, `.writable-check-${Date.now()}`);
      fs.writeFileSync(testFile, "");
      fs.unlinkSync(testFile);
      cached = base;
      return base;
    } catch {
      // Not writable — try the next candidate.
    }
  }
  cached = path.join(os.tmpdir(), "9router");
  return cached;
}
