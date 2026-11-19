import { runBackgroundTokenRefreshTick } from "@/sse/services/backgroundTokenRefresh.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  return handleRefresh(request);
}

export async function POST(request) {
  return handleRefresh(request);
}

async function handleRefresh(request) {
  const url = new URL(request.url);
  const secretParam = url.searchParams.get("secret");
  const authHeader = request.headers.get("Authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7).trim()
    : null;
  const headerSecret = request.headers.get("x-cron-secret");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret) {
    const provided = secretParam || bearerToken || headerSecret;
    if (provided !== cronSecret) {
      return Response.json(
        { error: "Unauthorized: Invalid or missing cron secret" },
        { status: 401 }
      );
    }
  }

  try {
    const result = await runBackgroundTokenRefreshTick();
    return Response.json({
      success: true,
      timestamp: new Date().toISOString(),
      message: "Token refresh tick executed successfully",
      details: result ?? null,
    });
  } catch (error) {
    console.error("[CRON] Token refresh tick error:", error);
    return Response.json(
      {
        success: false,
        error: error.message || String(error),
      },
      { status: 500 }
    );
  }
}
