import { ERROR_TYPES, DEFAULT_ERROR_MESSAGES } from "../config/errorConfig.js";

/**
 * Build OpenAI-compatible error response body
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @returns {object} Error response object
 */
export function buildErrorBody(statusCode, message) {
  const errorInfo = ERROR_TYPES[statusCode] || 
    (statusCode >= 500 
      ? { type: "server_error", code: "internal_server_error" }
      : { type: "invalid_request_error", code: "" });

  return {
    error: {
      message: message || DEFAULT_ERROR_MESSAGES[statusCode] || "An error occurred",
      type: errorInfo.type,
      code: errorInfo.code
    }
  };
}

/**
 * Create error Response object (for non-streaming)
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @returns {Response} HTTP Response object
 */
export function errorResponse(statusCode, message, extraHeaders = null) {
  return new Response(JSON.stringify(buildErrorBody(statusCode, message)), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      ...extraHeaders
    }
  });
}

/**
 * Write error to SSE stream (for streaming)
 * @param {WritableStreamDefaultWriter} writer - Stream writer
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 */
export async function writeStreamError(writer, statusCode, message) {
  const errorBody = buildErrorBody(statusCode, message);
  const encoder = new TextEncoder();
  await writer.write(encoder.encode(`data: ${JSON.stringify(errorBody)}\n\n`));
}

/**
 * Clean up HTML error pages (e.g. Cloudflare WAF, Cloudflare Challenge, Nginx, etc.)
 * into human-readable single-line error messages.
 * @param {string} bodyText
 * @param {number} [status]
 * @returns {string}
 */
export function cleanHtmlError(bodyText, status) {
  if (!bodyText || typeof bodyText !== "string") {
    return `Upstream returned empty error (HTTP ${status || "unknown"})`;
  }
  const trimmed = bodyText.trim();
  const isHtml = trimmed.startsWith("<") || trimmed.toLowerCase().includes("<html") || trimmed.toLowerCase().includes("<!doctype html");
  if (!isHtml) return bodyText;

  // Cloudflare block / challenge detection
  if (
    bodyText.includes("Attention Required! | Cloudflare") ||
    bodyText.includes("Sorry, you have been blocked") ||
    bodyText.includes("You are unable to access") ||
    bodyText.includes("Just a moment...")
  ) {
    const rayMatch = bodyText.match(/Cloudflare Ray ID:\s*(?:<[^>]+>)*([a-f0-9]+)/i);
    const rayId = rayMatch?.[1] ? ` [Ray ID: ${rayMatch[1]}]` : "";
    return `Cloudflare WAF / Bot Block${rayId}: Upstream Cloudflare protection blocked Cloudflare Pages datacenter IP. Configure a Proxy or Relay in Proxy Pools to route this provider's traffic.`;
  }

  // ChatGPT WAF block
  if (bodyText.includes("Unable to load site") && bodyText.includes("VPN")) {
    return "ChatGPT WAF Block: Cloudflare Pages datacenter IP is blocked by chatgpt.com. Configure a Proxy or Relay in Proxy Pools to route Codex traffic.";
  }

  const titleMatch = bodyText.match(/<title>([^<]+)<\/title>/i);
  const title = titleMatch?.[1]?.replace(/[\r\n]+/g, " ")?.trim();
  const h1Match = bodyText.match(/<h1[^>]*>([^<]+)<\/h1>/i);
  const h1 = h1Match?.[1]?.replace(/[\r\n]+/g, " ")?.trim();
  const pMatch = bodyText.match(/<p[^>]*>([^<]+)<\/p>/i);
  const p = pMatch?.[1]?.replace(/[\r\n]+/g, " ")?.trim();

  const cleanText = [title, h1, p].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" - ") ||
    bodyText.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 200);

  return cleanText || `Upstream returned HTML error page (HTTP ${status || "unknown"})`;
}

/**
 * Parse upstream provider error response
 * @param {Response} response - Fetch response from provider
 * @param {object} [executor] - Optional executor with parseError() override for provider-specific parsing
 * @returns {Promise<{statusCode: number, message: string, resetsAtMs?: number}>}
 */
export async function parseUpstreamError(response, executor = null) {
  let bodyText = "";
  try {
    bodyText = await response.text();
  } catch {
    bodyText = "";
  }

  // Let executor-specific parser extract provider-specific fields (e.g. codex resetsAtMs)
  if (executor && typeof executor.parseError === "function") {
    try {
      const parsed = executor.parseError(response, bodyText);
      if (parsed && typeof parsed === "object") {
        let msg = parsed.message || DEFAULT_ERROR_MESSAGES[response.status] || `Upstream error: ${response.status}`;
        msg = cleanHtmlError(msg, response.status);
        return { statusCode: parsed.status || response.status, message: msg, resetsAtMs: parsed.resetsAtMs };
      }
    } catch { /* fall through to default parsing */ }
  }

  let message = "";
  try {
    const json = JSON.parse(bodyText);
    message = json.error?.message || json.message || json.error || bodyText;
  } catch {
    message = cleanHtmlError(bodyText, response.status);
  }

  const messageStr = typeof message === "string" ? message : JSON.stringify(message);
  const finalMessage = cleanHtmlError(messageStr || DEFAULT_ERROR_MESSAGES[response.status] || `Upstream error: ${response.status}`, response.status);

  return { statusCode: response.status, message: finalMessage };
}

/**
 * Create error result for chatCore handler
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @param {number} [resetsAtMs] - Optional precise cooldown expiry (ms epoch) for provider-specific quota errors
 * @returns {{ success: false, status: number, error: string, response: Response, resetsAtMs?: number }}
 */
export function createErrorResult(statusCode, message, resetsAtMs, extraHeaders = null) {
  return {
    success: false,
    status: statusCode,
    error: message,
    resetsAtMs,
    response: errorResponse(statusCode, message, extraHeaders)
  };
}

/**
 * Create unavailable response when all accounts are rate limited
 * @param {number} statusCode - Original error status code
 * @param {string} message - Error message (without retry info)
 * @param {string} retryAfter - ISO timestamp when earliest account becomes available
 * @param {string} retryAfterHuman - Human-readable retry info e.g. "reset after 30s"
 * @returns {Response}
 */
export function unavailableResponse(statusCode, message, retryAfter, retryAfterHuman, extraHeaders = null) {
  const retryAfterSec = Math.max(Math.ceil((new Date(retryAfter).getTime() - Date.now()) / 1000), 1);
  const msg = `${message} (${retryAfterHuman})`;
  return new Response(
    JSON.stringify({ error: { message: msg } }),
    {
      status: statusCode,
      headers: {
        ...extraHeaders,
        "Content-Type": "application/json",
        // Intentionally mis-cased to prevent duplicate headers
        "retry-after": String(retryAfterSec)
      }
    }
  );
}

/**
 * Format provider error with context
 * @param {Error} error - Original error
 * @param {string} provider - Provider name
 * @param {string} model - Model name
 * @param {number|string} statusCode - HTTP status code or error code
 * @returns {string} Formatted error message
 */
export function formatProviderError(error, provider, model, statusCode) {
  const code = statusCode || error.code || "FETCH_FAILED";
  const message = error.message || "Unknown error";
  // Expose low-level cause (e.g. UND_ERR_SOCKET, ECONNRESET, ETIMEDOUT) for diagnosing fetch failures
  const causeCode = error.cause?.code;
  const causeMsg = error.cause?.message;
  const causeStr = causeCode || causeMsg ? ` (cause: ${[causeCode, causeMsg].filter(Boolean).join(": ")})` : "";
  return `[${code}]: ${message}${causeStr}`;
}
