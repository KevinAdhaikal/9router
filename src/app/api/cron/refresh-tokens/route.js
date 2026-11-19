import { NextResponse } from "next/server";
import { runBackgroundTokenRefreshTick } from "@/sse/services/backgroundTokenRefresh.js";

export const dynamic = "force-dynamic";

function isAuthorized(request) {
  const cronSecret = (process.env.CRON_SECRET || "").trim();
  if (!cronSecret) {
    // If no secret is configured, allow requests (e.g. initial setup)
    return true;
  }

  // 1. Authorization: Bearer <secret>
  const authHeader = (request.headers.get("authorization") || "").trim();
  if (authHeader.startsWith("Bearer ") && authHeader.slice(7).trim() === cronSecret) {
    return true;
  }

  // 2. x-cron-secret header
  const customHeader = (request.headers.get("x-cron-secret") || "").trim();
  if (customHeader && customHeader === cronSecret) {
    return true;
  }

  // 3. Query parameter ?secret=<secret> (useful for Google Apps Script UrlFetchApp)
  try {
    const url = new URL(request.url);
    const querySecret = (url.searchParams.get("secret") || "").trim();
    if (querySecret && querySecret === cronSecret) {
      return true;
    }
  } catch (err) {
    console.error("[Cron] Error parsing request URL:", err);
  }

  // 4. Vercel Cron header
  if (request.headers.get("x-vercel-cron")) {
    return true;
  }

  console.warn("[Cron] Unauthorized attempt. Received headers:", {
    hasAuth: !!authHeader,
    hasCustom: !!customHeader,
    cronSecretConfiguredLen: cronSecret.length,
  });
  return false;
}

async function handleRefresh(request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    console.log("[Cron] Triggering background token refresh tick...");
    await runBackgroundTokenRefreshTick();
    return NextResponse.json({
      success: true,
      message: "Background token refresh tick executed successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Cron] Error running background token refresh:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Token refresh failed",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

export async function GET(request) {
  return handleRefresh(request);
}

export async function POST(request) {
  return handleRefresh(request);
}
