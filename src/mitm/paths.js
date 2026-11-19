const fs = require("fs");
const path = require("path");
const os = require("os");

const APP_NAME = "9router";

function defaultDir() {
  if (process.env.VERCEL) {
    const tmp = path.join(os.tmpdir(), `.${APP_NAME}`);
    try { fs.mkdirSync(tmp, { recursive: true }); } catch {}
    return tmp;
  }
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), APP_NAME);
  }
  try {
    const dir = path.join(os.homedir(), `.${APP_NAME}`);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  } catch {
    const tmp = path.join(os.tmpdir(), `.${APP_NAME}`);
    try { fs.mkdirSync(tmp, { recursive: true }); } catch {}
    return tmp;
  }
}

function getDataDir() {
  const configured = process.env.DATA_DIR;
  if (!configured) return defaultDir();
  try {
    fs.mkdirSync(configured, { recursive: true });
    return configured;
  } catch (e) {
    console.warn(`[DATA_DIR] '${configured}' not writable (${e?.code}) → fallback default`);
    return defaultDir();
  }
}

const DATA_DIR = getDataDir();
const MITM_DIR = path.join(DATA_DIR, "mitm");
try { fs.mkdirSync(MITM_DIR, { recursive: true }); } catch {}

module.exports = { DATA_DIR, MITM_DIR };
