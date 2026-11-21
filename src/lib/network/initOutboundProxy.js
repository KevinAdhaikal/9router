import { getSettings } from "@/lib/localDb";
import { applyOutboundProxyEnv } from "@/lib/network/outboundProxy";

let initialized = false;

export async function ensureOutboundProxyInitialized() {
  if (initialized) return true;

  try {
    const settings = await getSettings();
    applyOutboundProxyEnv(settings);
    initialized = true;
  } catch (error) {
    console.error("[ServerInit] Error initializing outbound proxy:", error);
  }

  return initialized;
}

// Defer init so HTTP server accepts connections first (Node.js only)
const isWorkers = typeof navigator !== "undefined" && (navigator.userAgent === "Cloudflare-Workers" || navigator.userAgent?.includes("Cloudflare"));
if (!isWorkers && typeof setImmediate === "function") {
  setImmediate(() => {
    ensureOutboundProxyInitialized().catch(() => {});
  });
}

export default ensureOutboundProxyInitialized;
