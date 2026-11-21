import crypto from "node:crypto";

let cachedRawId = null;

function loadRawMachineId() {
  if (cachedRawId) return cachedRawId;
  cachedRawId = process.env.MACHINE_ID || crypto.randomUUID();
  return cachedRawId;
}

export async function getConsistentMachineId(salt = "endpoint-proxy-salt") {
  const rawId = loadRawMachineId();
  return crypto.createHash("sha256").update(rawId + salt).digest("hex").substring(0, 16);
}
