import { existsSync } from "node:fs";
import path from "node:path";
import { Worker } from "node:worker_threads";

import { findDeepSeekPowNonce, MAX_DEEPSEEK_POW_DIFFICULTY } from "./deepseek-pow-hash.js";

const DEEPSEEK_POW_ALGORITHM = "DeepSeekHashV1";
const SHA3_256_HEX_PATTERN = /^[a-f0-9]{64}$/i;
const MAX_DIFFICULTY = MAX_DEEPSEEK_POW_DIFFICULTY;
const MAX_SALT_LENGTH = 1024;
const MAX_CONCURRENT_WORKERS = 2;
const DEFAULT_TIMEOUT_MS = 10000;
const MAX_TIMEOUT_MS = 30000;

let activeWorkerCount = 0;

function createAbortError() {
  const error = new Error("DeepSeek PoW computation aborted");
  error.name = "AbortError";
  return error;
}

function validateChallenge(algorithm, challenge, salt, difficulty, expireAt, options = {}) {
  if (algorithm !== DEEPSEEK_POW_ALGORITHM) {
    throw new Error(`Unsupported DeepSeek PoW algorithm: ${algorithm}`);
  }
  if (!SHA3_256_HEX_PATTERN.test(challenge)) {
    throw new Error("DeepSeek PoW challenge must be a 64-character SHA3-256 hex digest");
  }
  if (typeof salt !== "string" || salt.length === 0 || salt.length > MAX_SALT_LENGTH) {
    throw new Error(`DeepSeek PoW salt must contain 1-${MAX_SALT_LENGTH} characters`);
  }
  if (!Number.isSafeInteger(difficulty) || difficulty < 1 || difficulty > MAX_DIFFICULTY) {
    throw new Error(`DeepSeek PoW difficulty must be an integer from 1 to ${MAX_DIFFICULTY}`);
  }
  if (!Number.isSafeInteger(expireAt) || expireAt < 0) {
    throw new Error("DeepSeek PoW expiry must be a non-negative safe integer");
  }

  return {
    algorithm,
    challenge: challenge.toLowerCase(),
    salt,
    difficulty,
    expireAt,
    expire_at: expireAt,
    signature: options.signature || null,
    target_path: options.target_path || null,
    prefix: `${salt}_${expireAt}_`,
  };
}

function resolveTimeoutMs(timeoutMs) {
  if (timeoutMs === undefined) return DEFAULT_TIMEOUT_MS;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT_MS) {
    throw new Error(`DeepSeek PoW timeout must be an integer from 1 to ${MAX_TIMEOUT_MS}ms`);
  }
  return timeoutMs;
}

function solveSynchronously(validated) {
  return findDeepSeekPowNonce(validated.prefix, validated.challenge, validated.difficulty);
}

// Anchored on process.cwd(), never import.meta.url: the production standalone
// bundle freezes import.meta.url to the build-machine path, leaving an
// import.meta.url-relative fallback silently dead in production. A single
// non-branching cwd-relative path avoids both problems.
function resolveWorkerPath() {
  try {
    if (typeof process !== "undefined" && typeof process.cwd === "function") {
      const workerPath = path.join(process.cwd(), "open-sse/lib/deepseek-pow-worker.mjs");
      if (existsSync(workerPath)) {
        return workerPath;
      }
    }
  } catch {
    // Filesystem not accessible in this environment
  }
  return null;
}

async function solveRemotely(validated, solverUrl, options = {}) {
  const { signal } = options;
  const timeoutMs = resolveTimeoutMs(options.timeoutMs);

  const payload = {
    algorithm: validated.algorithm || DEEPSEEK_POW_ALGORITHM,
    challenge: validated.challenge,
    salt: validated.salt,
    signature: validated.signature || options.signature || undefined,
    difficulty: validated.difficulty,
    expire_at: validated.expire_at ?? validated.expireAt,
  };

  const headers = {
    "Content-Type": "application/json",
  };
  if (options.powSolverKey) {
    headers["Authorization"] = `Bearer ${options.powSolverKey}`;
  }

  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const combinedSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  const res = await fetch(solverUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    signal: combinedSignal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Remote DeepSeek PoW solver (${solverUrl}) returned HTTP ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const answer = data.answer ?? data.nonce;
  if (!Number.isSafeInteger(answer) || answer < -1) {
    throw new Error(`Remote DeepSeek PoW solver (${solverUrl}) returned invalid answer: ${JSON.stringify(data)}`);
  }
  return answer;
}

function solveInWorker(validated, workerPath, options = {}) {
  const { signal } = options;
  if (signal?.aborted) return Promise.reject(createAbortError());
  if (activeWorkerCount >= MAX_CONCURRENT_WORKERS) {
    return Promise.reject(
      new Error(`DeepSeek PoW worker capacity reached (${MAX_CONCURRENT_WORKERS})`)
    );
  }

  const timeoutMs = resolveTimeoutMs(options.timeoutMs);
  activeWorkerCount += 1;

  return new Promise((resolve, reject) => {
    // The slot is taken before this executor runs, so anything that throws here
    // -- a missing worker script, a spawn failure -- has to hand it back. Without
    // this, MAX_CONCURRENT_WORKERS spawn failures wedge the solver permanently
    // and every later call reports "capacity reached" instead of the real cause.
    let worker;
    try {
      worker = new Worker(workerPath, { workerData: validated });
    } catch (error) {
      activeWorkerCount = Math.max(0, activeWorkerCount - 1);
      reject(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    let settled = false;

    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
      activeWorkerCount = Math.max(0, activeWorkerCount - 1);
    };
    const finish = (callback, terminate) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (terminate) void worker.terminate();
      callback();
    };
    const onAbort = () => {
      finish(() => reject(createAbortError()), true);
    };
    const timeout = setTimeout(() => {
      finish(() => reject(new Error(`DeepSeek PoW computation exceeded ${timeoutMs}ms`)), true);
    }, timeoutMs);

    signal?.addEventListener("abort", onAbort, { once: true });
    worker.once("message", (answer) => {
      if (!Number.isSafeInteger(answer) || answer < -1) {
        finish(() => reject(new Error("DeepSeek PoW worker returned an invalid answer")), true);
        return;
      }
      finish(() => resolve(answer), false);
    });
    worker.once("error", (error) => {
      finish(() => reject(error), true);
    });
    worker.once("exit", (code) => {
      if (code !== 0) {
        finish(() => reject(new Error(`DeepSeek PoW worker exited with code ${code}`)), false);
      } else {
        finish(() => reject(new Error("DeepSeek PoW worker exited without an answer")), false);
      }
    });
  });
}

export async function solveDeepSeekPowAsync(
  algorithm,
  challenge,
  salt,
  difficulty,
  expireAt,
  options = {}
) {
  const validated = validateChallenge(algorithm, challenge, salt, difficulty, expireAt, options);

  // 1. Remote solver if URL provided (via options or process.env.DEEPSEEK_POW_URL)
  const solverUrl = options.powSolverUrl || (typeof process !== "undefined" && process.env?.DEEPSEEK_POW_URL) || null;
  if (solverUrl) {
    return solveRemotely(validated, solverUrl, options);
  }

  // 2. Node.js worker_threads if available and script exists on disk
  const workerPath = resolveWorkerPath();
  if (workerPath && typeof Worker !== "undefined") {
    try {
      return await solveInWorker(validated, workerPath, options);
    } catch (err) {
      if (options.log) options.log.warn?.("DEEPSEEK-POW", `Worker failed: ${err.message}, falling back to synchronous solve`);
    }
  }

  // 3. Fallback: in-process synchronous solve (suitable for Cloudflare Workers / browser when difficulty is low)
  return solveSynchronously(validated);
}

export function solveDeepSeekPow(algorithm, challenge, salt, difficulty, expireAt) {
  // Compatibility-only synchronous API. The validated difficulty ceiling bounds
  // CPU use; request handling must use solveDeepSeekPowAsync() so hashing stays
  // off the event loop and remains abortable.
  const validated = validateChallenge(algorithm, challenge, salt, difficulty, expireAt);
  return solveSynchronously(validated);
}
