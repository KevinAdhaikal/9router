import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const APP_NAME = "9router";

function defaultDir() {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), APP_NAME);
  }
  return path.join(os.homedir(), `.${APP_NAME}`);
}

function isWritableDir(dir) {
  if (!dir) return false;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const testFile = path.join(dir, `.writable-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    fs.writeFileSync(testFile, "");
    fs.unlinkSync(testFile);
    return true;
  } catch {
    return false;
  }
}

export function getDataDir() {
  const configured = process.env.DATA_DIR;

  // If user explicitly configured DATA_DIR
  if (configured) {
    if (process.platform === "win32" && /^\//.test(configured)) {
      console.warn(`[DATA_DIR] '${configured}' is a Unix path on Windows → fallback to default`);
    } else if (isWritableDir(configured)) {
      return configured;
    } else {
      console.warn(`[DATA_DIR] '${configured}' not writable → searching fallback`);
    }
  }

  // In serverless / Netlify environments, homedir is read-only (/var/task or /root)
  // while /tmp (os.tmpdir()) is the designated writable directory.
  const isServerless = !!(
    process.env.NETLIFY ||
    process.env.AWS_LAMBDA_FUNCTION_NAME ||
    process.env.VERCEL ||
    process.env.DENO_DEPLOYMENT_ID
  );

  const tmpDir = path.join(os.tmpdir(), APP_NAME);
  const candidates = isServerless
    ? [tmpDir, defaultDir(), path.join("/tmp", APP_NAME)]
    : [defaultDir(), tmpDir, path.join("/tmp", APP_NAME)];

  for (const candidate of candidates) {
    if (isWritableDir(candidate)) {
      return candidate;
    }
  }

  return tmpDir;
}

export const DATA_DIR = getDataDir();
