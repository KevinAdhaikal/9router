import { Hono } from "hono";
import { cors } from "hono/cors";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { setCurrentCookieHeader } from "@/lib/shims/nextHeaders.js";
import {
  createDashboardAuthToken,
  verifyDashboardAuthToken,
  verifyDashboardPassword,
} from "@/lib/auth/dashboardSession.js";
import { getSettings } from "@/lib/localDb";

// Route modules - System & Auth
import * as healthRoute from "@/app/api/health/route.js";
import * as initRoute from "@/app/api/init/route.js";
import * as versionRoute from "@/app/api/version/route.js";
import * as authResetPasswordRoute from "@/app/api/auth/reset-password/route.js";
import * as oidcCallbackRoute from "@/app/api/auth/oidc/callback/route.js";
import * as oidcStartRoute from "@/app/api/auth/oidc/start/route.js";
import * as oidcTestRoute from "@/app/api/auth/oidc/test/route.js";
import * as samlAcsRoute from "@/app/api/auth/saml/acs/route.js";
import * as samlMetadataRoute from "@/app/api/auth/saml/metadata/route.js";
import * as samlStartRoute from "@/app/api/auth/saml/start/route.js";
import * as samlTestRoute from "@/app/api/auth/saml/test/route.js";

// Keys
import * as keysRoute from "@/app/api/keys/route.js";
import * as keysIdRoute from "@/app/api/keys/[id]/route.js";

// Providers
import * as providersRoute from "@/app/api/providers/route.js";
import * as providersClientRoute from "@/app/api/providers/client/route.js";
import * as providersValidateRoute from "@/app/api/providers/validate/route.js";
import * as providersTestBatchRoute from "@/app/api/providers/test-batch/route.js";
import * as providersSuggestedModelsRoute from "@/app/api/providers/suggested-models/route.js";
import * as providersKiloFreeModelsRoute from "@/app/api/providers/kilo/free-models/route.js";
import * as providersWebLoginRoute from "@/app/api/providers/web-login/route.js";
import * as providersIdRoute from "@/app/api/providers/[id]/route.js";
import * as providersIdModelsRoute from "@/app/api/providers/[id]/models/route.js";
import * as providersIdTestRoute from "@/app/api/providers/[id]/test/route.js";
import * as providersIdTestModelsRoute from "@/app/api/providers/[id]/test-models/route.js";
import * as providersIdOverridesRoute from "@/app/api/providers/[id]/overrides/route.js";

// Provider Nodes
import * as providerNodesRoute from "@/app/api/provider-nodes/route.js";
import * as providerNodesIdRoute from "@/app/api/provider-nodes/[id]/route.js";
import * as providerNodesValidateRoute from "@/app/api/provider-nodes/validate/route.js";

// Combos
import * as combosRoute from "@/app/api/combos/route.js";
import * as combosPresetsRoute from "@/app/api/combos/presets/route.js";
import * as combosIdRoute from "@/app/api/combos/[id]/route.js";

// Settings
import * as settingsRoute from "@/app/api/settings/route.js";
import * as settingsRequireLoginRoute from "@/app/api/settings/require-login/route.js";
import * as settingsDatabaseRoute from "@/app/api/settings/database/route.js";
import * as settingsProxyTestRoute from "@/app/api/settings/proxy-test/route.js";

// Models
import * as modelsRoute from "@/app/api/models/route.js";
import * as modelsCustomRoute from "@/app/api/models/custom/route.js";
import * as modelsDisabledRoute from "@/app/api/models/disabled/route.js";
import * as modelsAvailabilityRoute from "@/app/api/models/availability/route.js";
import * as modelsAliasRoute from "@/app/api/models/alias/route.js";
import * as modelsCatalogSyncRoute from "@/app/api/models/catalog-sync/route.js";
import * as modelsTestRoute from "@/app/api/models/test/route.js";

// Proxy Pools
import * as proxyPoolsRoute from "@/app/api/proxy-pools/route.js";
import * as proxyPoolsIdRoute from "@/app/api/proxy-pools/[id]/route.js";
import * as proxyPoolsIdTestRoute from "@/app/api/proxy-pools/[id]/test/route.js";
import * as proxyPoolsCloudflareRoute from "@/app/api/proxy-pools/cloudflare-deploy/route.js";
import * as proxyPoolsDenoRoute from "@/app/api/proxy-pools/deno-deploy/route.js";
import * as proxyPoolsNetlifyRoute from "@/app/api/proxy-pools/netlify-deploy/route.js";
import * as proxyPoolsVercelRoute from "@/app/api/proxy-pools/vercel-deploy/route.js";

// Tags & Pricing
import * as tagsRoute from "@/app/api/tags/route.js";
import * as pricingRoute from "@/app/api/pricing/route.js";

// Translator
import * as translatorLoadRoute from "@/app/api/translator/load/route.js";
import * as translatorSaveRoute from "@/app/api/translator/save/route.js";
import * as translatorSendRoute from "@/app/api/translator/send/route.js";
import * as translatorTranslateRoute from "@/app/api/translator/translate/route.js";

// MCP
import * as mcpMessageRoute from "@/app/api/mcp/[plugin]/message/route.js";
import * as mcpSseRoute from "@/app/api/mcp/[plugin]/sse/route.js";

// Media Providers
import * as mediaTtsVoicesRoute from "@/app/api/media-providers/tts/voices/route.js";
import * as mediaTtsDeepgramRoute from "@/app/api/media-providers/tts/deepgram/voices/route.js";
import * as mediaTtsElevenlabsRoute from "@/app/api/media-providers/tts/elevenlabs/voices/route.js";
import * as mediaTtsInworldRoute from "@/app/api/media-providers/tts/inworld/voices/route.js";
import * as mediaTtsMinimaxRoute from "@/app/api/media-providers/tts/minimax/voices/route.js";

// Cron
import * as cronRefreshTokenRoute from "@/app/api/cron/refresh-token/route.js";

// CLI Tools
import * as cliAllStatusesRoute from "@/app/api/cli-tools/all-statuses/route.js";
import * as cliClaudeSettingsRoute from "@/app/api/cli-tools/claude-settings/route.js";
import * as cliClineSettingsRoute from "@/app/api/cli-tools/cline-settings/route.js";
import * as cliCodexSettingsRoute from "@/app/api/cli-tools/codex-settings/route.js";
import * as cliCodexProfilesRoute from "@/app/api/cli-tools/codex-profiles/route.js";
import * as cliCoworkSettingsRoute from "@/app/api/cli-tools/cowork-settings/route.js";
import * as cliCoworkMcpToolsRoute from "@/app/api/cli-tools/cowork-mcp-tools/route.js";
import * as cliCoworkMcpRegistryRoute from "@/app/api/cli-tools/cowork-mcp-registry/route.js";
import * as cliCrushSettingsRoute from "@/app/api/cli-tools/crush-settings/route.js";
import * as cliDeepseekTuiSettingsRoute from "@/app/api/cli-tools/deepseek-tui-settings/route.js";
import * as cliDevinSettingsRoute from "@/app/api/cli-tools/devin-settings/route.js";
import * as cliDroidSettingsRoute from "@/app/api/cli-tools/droid-settings/route.js";
import * as cliForgeSettingsRoute from "@/app/api/cli-tools/forge-settings/route.js";
import * as cliGrokBuildSettingsRoute from "@/app/api/cli-tools/grok-build-settings/route.js";
import * as cliHermesSettingsRoute from "@/app/api/cli-tools/hermes-settings/route.js";
import * as cliHermesProfilesRoute from "@/app/api/cli-tools/hermes-profiles/route.js";
import * as cliJcodeSettingsRoute from "@/app/api/cli-tools/jcode-settings/route.js";
import * as cliKiloSettingsRoute from "@/app/api/cli-tools/kilo-settings/route.js";
import * as cliOmpSettingsRoute from "@/app/api/cli-tools/omp-settings/route.js";
import * as cliOpenclawSettingsRoute from "@/app/api/cli-tools/openclaw-settings/route.js";
import * as cliOpencodeSettingsRoute from "@/app/api/cli-tools/opencode-settings/route.js";
import * as cliPiSettingsRoute from "@/app/api/cli-tools/pi-settings/route.js";
import * as cliSmeltSettingsRoute from "@/app/api/cli-tools/smelt-settings/route.js";
import * as cliCodewhaleSettingsRoute from "@/app/api/cli-tools/codewhale-settings/route.js";
import * as cliCopilotSettingsRoute from "@/app/api/cli-tools/copilot-settings/route.js";
import * as cliAntigravityMitmRoute from "@/app/api/cli-tools/antigravity-mitm/route.js";
import * as cliAntigravityMitmAliasRoute from "@/app/api/cli-tools/antigravity-mitm/alias/route.js";

// OAuth routes
import * as oauthProviderActionRoute from "@/app/api/oauth/[provider]/[action]/route.js";
import * as oauthCodexBulkRoute from "@/app/api/oauth/codex/bulk-import/route.js";
import * as oauthCodexImportRoute from "@/app/api/oauth/codex/import-token/route.js";
import * as oauthCursorAutoRoute from "@/app/api/oauth/cursor/auto-import/route.js";
import * as oauthCursorImportRoute from "@/app/api/oauth/cursor/import/route.js";
import * as oauthGitlabPatRoute from "@/app/api/oauth/gitlab/pat/route.js";
import * as oauthGrokCliBulkRoute from "@/app/api/oauth/grok-cli/bulk-import/route.js";
import * as oauthIflowCookieRoute from "@/app/api/oauth/iflow/cookie/route.js";
import * as oauthKiroApiKeyRoute from "@/app/api/oauth/kiro/api-key/route.js";
import * as oauthKiroAutoRoute from "@/app/api/oauth/kiro/auto-import/route.js";
import * as oauthKiroImportCliProxyRoute from "@/app/api/oauth/kiro/import-cli-proxy/route.js";
import * as oauthKiroImportRoute from "@/app/api/oauth/kiro/import/route.js";
import * as oauthKiroSocialAuthRoute from "@/app/api/oauth/kiro/social-authorize/route.js";
import * as oauthKiroSocialExchangeRoute from "@/app/api/oauth/kiro/social-exchange/route.js";
import * as oauthXiaomiApiKeyRoute from "@/app/api/oauth/xiaomi-mimo/api-key/route.js";
import * as oauthXiaomiAutoRoute from "@/app/api/oauth/xiaomi-mimo/auto-import/route.js";
import * as oauthXiaomiLoginStartRoute from "@/app/api/oauth/xiaomi-mimo/login/start/route.js";
import * as oauthXiaomiLoginStatusRoute from "@/app/api/oauth/xiaomi-mimo/login/status/route.js";
import * as oauthZedAutoRoute from "@/app/api/oauth/zed/auto-import/route.js";
import * as oauthZedImportRoute from "@/app/api/oauth/zed/import/route.js";

// AI Core Routes
import * as v1ChatCompletionsRoute from "@/app/api/v1/chat/completions/route.js";
import * as v1MessagesRoute from "@/app/api/v1/messages/route.js";
import * as v1MessagesCountTokensRoute from "@/app/api/v1/messages/count_tokens/route.js";
import * as v1ModelsRoute from "@/app/api/v1/models/route.js";
import * as v1ModelsInfoRoute from "@/app/api/v1/models/info/route.js";
import * as v1ModelsModelRoute from "@/app/api/v1/models/[...model]/route.js";
import * as v1EmbeddingsRoute from "@/app/api/v1/embeddings/route.js";
import * as v1ImagesRoute from "@/app/api/v1/images/generations/route.js";
import * as v1AudioSpeechRoute from "@/app/api/v1/audio/speech/route.js";
import * as v1AudioTranscriptionsRoute from "@/app/api/v1/audio/transcriptions/route.js";
import * as v1AudioVoicesRoute from "@/app/api/v1/audio/voices/route.js";
import * as v1VideosRoute from "@/app/api/v1/videos/generations/route.js";
import * as v1VideosEditsRoute from "@/app/api/v1/videos/edits/route.js";
import * as v1VideosExtensionsRoute from "@/app/api/v1/videos/extensions/route.js";
import * as v1VideosIdRoute from "@/app/api/v1/videos/[id]/route.js";
import * as v1WebFetchRoute from "@/app/api/v1/web/fetch/route.js";
import * as v1ResponsesRoute from "@/app/api/v1/responses/route.js";
import * as v1ResponsesCompactRoute from "@/app/api/v1/responses/compact/route.js";
import * as v1SystemoneRoute from "@/app/api/v1/systemone/route.js";
import * as v1SearchRoute from "@/app/api/v1/search/route.js";

// Gemini v1beta Routes
import * as v1betaModelsRoute from "@/app/api/v1beta/models/route.js";
import * as v1betaModelsPathRoute from "@/app/api/v1beta/models/[...path]/route.js";

const app = new Hono();

// Route adapter with parameter parsing
const adapt = (handler) => async (c) => {
  const rawParams = c.req.param();
  const params = {};
  for (const [key, val] of Object.entries(rawParams)) {
    if (key === "path" || key === "model") {
      params[key] = typeof val === "string" ? val.split("/").filter(Boolean) : val;
    } else {
      params[key] = val;
    }
  }
  return await handler(c.req.raw, { params });
};

// 1. Context Middleware (D1, Env vars, Cookies)
app.use("*", async (c, next) => {
  if (c.env?.DB) {
    globalThis.__CLOUDFLARE_D1_DB__ = c.env.DB;
  }
  if (c.env) {
    for (const [k, v] of Object.entries(c.env)) {
      if (typeof v === "string" && !process.env[k]) {
        process.env[k] = v;
      }
    }
  }
  const cookieHeader = c.req.header("cookie") || "";
  setCurrentCookieHeader(cookieHeader);
  await next();
});

// 2. CORS for AI API
app.use("/v1/*", cors());
app.use("/v1beta/*", cors());
app.use("/api/v1/*", cors());
app.use("/api/v1beta/*", cors());

// 3. Auth Middleware for Dashboard API
app.use("/api/*", async (c, next) => {
  const path = c.req.path;
  if (
    path === "/api/health" ||
    path === "/api/init" ||
    path === "/api/version" ||
    path === "/api/auth/login" ||
    path === "/api/auth/logout" ||
    path === "/api/auth/status" ||
    path === "/api/auth/reset-password" ||
    path === "/api/settings/require-login" ||
    path.startsWith("/api/auth/oidc") ||
    path.startsWith("/api/auth/saml") ||
    path.startsWith("/api/oauth") ||
    path === "/api/cron/refresh-token"
  ) {
    return next();
  }

  const token = getCookie(c, "auth_token");
  if (token && (await verifyDashboardAuthToken(token))) {
    return next();
  }

  try {
    const settings = await getSettings();
    if (settings && settings.requireLogin === false) {
      return next();
    }
  } catch (_) {}

  return c.json({ error: "Unauthorized" }, 401);
});

// 4. Custom Auth Handlers
app.post("/api/auth/login", async (c) => {
  try {
    const { password } = await c.req.json();
    const isValid = await verifyDashboardPassword(password);
    if (!isValid) {
      return c.json({ error: "Invalid password" }, 401);
    }
    const token = await createDashboardAuthToken();
    const isHttps = c.req.header("x-forwarded-proto") === "https" || c.req.url.startsWith("https:");
    setCookie(c, "auth_token", token, {
      httpOnly: true,
      secure: isHttps,
      sameSite: "Lax",
      path: "/",
      maxAge: 24 * 60 * 60,
    });
    return c.json({ success: true, mustChangePassword: false });
  } catch (err) {
    return c.json({ error: err.message }, 500);
  }
});

app.post("/api/auth/logout", async (c) => {
  deleteCookie(c, "auth_token", { path: "/" });
  return c.json({ success: true });
});

app.get("/api/auth/status", async (c) => {
  const token = getCookie(c, "auth_token");
  const isAuthenticated = token ? await verifyDashboardAuthToken(token) : false;
  const settings = await getSettings().catch(() => ({}));
  return c.json({
    authenticated: isAuthenticated,
    requireLogin: settings?.requireLogin !== false,
    authMode: settings?.authMode || "password",
  });
});

app.post("/api/auth/reset-password", adapt(authResetPasswordRoute.POST));
app.get("/api/auth/oidc/callback", adapt(oidcCallbackRoute.GET));
app.get("/api/auth/oidc/start", adapt(oidcStartRoute.GET));
app.post("/api/auth/oidc/test", adapt(oidcTestRoute.POST));
app.post("/api/auth/saml/acs", adapt(samlAcsRoute.POST));
app.get("/api/auth/saml/metadata", adapt(samlMetadataRoute.GET));
app.get("/api/auth/saml/start", adapt(samlStartRoute.GET));
app.post("/api/auth/saml/test", adapt(samlTestRoute.POST));

// 5. Register Management API Routes
app.get("/api/health", adapt(healthRoute.GET));
app.get("/api/init", adapt(initRoute.GET));
app.get("/api/version", adapt(versionRoute.GET));

// Keys
app.get("/api/keys", adapt(keysRoute.GET));
app.post("/api/keys", adapt(keysRoute.POST));
app.get("/api/keys/:id", adapt(keysIdRoute.GET));
app.put("/api/keys/:id", adapt(keysIdRoute.PUT));
app.delete("/api/keys/:id", adapt(keysIdRoute.DELETE));

// Providers
app.get("/api/providers", adapt(providersRoute.GET));
app.post("/api/providers", adapt(providersRoute.POST));
app.get("/api/providers/client", adapt(providersClientRoute.GET));
app.post("/api/providers/validate", adapt(providersValidateRoute.POST));
app.post("/api/providers/test-batch", adapt(providersTestBatchRoute.POST));
app.get("/api/providers/suggested-models", adapt(providersSuggestedModelsRoute.GET));
app.get("/api/providers/kilo/free-models", adapt(providersKiloFreeModelsRoute.GET));
app.get("/api/providers/web-login", adapt(providersWebLoginRoute.GET));
app.post("/api/providers/web-login", adapt(providersWebLoginRoute.POST));
app.delete("/api/providers/web-login", adapt(providersWebLoginRoute.DELETE));
app.get("/api/providers/:id", adapt(providersIdRoute.GET));
app.put("/api/providers/:id", adapt(providersIdRoute.PUT));
app.delete("/api/providers/:id", adapt(providersIdRoute.DELETE));
app.get("/api/providers/:id/models", adapt(providersIdModelsRoute.GET));
app.post("/api/providers/:id/test", adapt(providersIdTestRoute.POST));
app.post("/api/providers/:id/test-models", adapt(providersIdTestModelsRoute.POST));
app.get("/api/providers/:id/overrides", adapt(providersIdOverridesRoute.GET));
app.put("/api/providers/:id/overrides", adapt(providersIdOverridesRoute.PUT));

// Provider Nodes
app.get("/api/provider-nodes", adapt(providerNodesRoute.GET));
app.post("/api/provider-nodes", adapt(providerNodesRoute.POST));
app.post("/api/provider-nodes/validate", adapt(providerNodesValidateRoute.POST));
app.put("/api/provider-nodes/:id", adapt(providerNodesIdRoute.PUT));
app.delete("/api/provider-nodes/:id", adapt(providerNodesIdRoute.DELETE));

// Combos
app.get("/api/combos", adapt(combosRoute.GET));
app.post("/api/combos", adapt(combosRoute.POST));
app.get("/api/combos/presets", adapt(combosPresetsRoute.GET));
app.post("/api/combos/presets", adapt(combosPresetsRoute.POST));
app.get("/api/combos/:id", adapt(combosIdRoute.GET));
app.put("/api/combos/:id", adapt(combosIdRoute.PUT));
app.delete("/api/combos/:id", adapt(combosIdRoute.DELETE));

// Settings
app.get("/api/settings", adapt(settingsRoute.GET));
app.patch("/api/settings", adapt(settingsRoute.PATCH));
app.get("/api/settings/require-login", adapt(settingsRequireLoginRoute.GET));
app.get("/api/settings/database", adapt(settingsDatabaseRoute.GET));
app.post("/api/settings/database", adapt(settingsDatabaseRoute.POST));
app.post("/api/settings/proxy-test", adapt(settingsProxyTestRoute.POST));

// Models
app.get("/api/models", adapt(modelsRoute.GET));
app.put("/api/models", adapt(modelsRoute.PUT));
app.get("/api/models/custom", adapt(modelsCustomRoute.GET));
app.post("/api/models/custom", adapt(modelsCustomRoute.POST));
app.delete("/api/models/custom", adapt(modelsCustomRoute.DELETE));
app.get("/api/models/disabled", adapt(modelsDisabledRoute.GET));
app.post("/api/models/disabled", adapt(modelsDisabledRoute.POST));
app.delete("/api/models/disabled", adapt(modelsDisabledRoute.DELETE));
app.get("/api/models/availability", adapt(modelsAvailabilityRoute.GET));
app.post("/api/models/availability", adapt(modelsAvailabilityRoute.POST));
app.get("/api/models/alias", adapt(modelsAliasRoute.GET));
app.put("/api/models/alias", adapt(modelsAliasRoute.PUT));
app.delete("/api/models/alias", adapt(modelsAliasRoute.DELETE));
app.get("/api/models/catalog-sync", adapt(modelsCatalogSyncRoute.GET));
app.post("/api/models/catalog-sync", adapt(modelsCatalogSyncRoute.POST));
app.post("/api/models/test", adapt(modelsTestRoute.POST));

// Proxy Pools
app.get("/api/proxy-pools", adapt(proxyPoolsRoute.GET));
app.post("/api/proxy-pools", adapt(proxyPoolsRoute.POST));
app.get("/api/proxy-pools/:id", adapt(proxyPoolsIdRoute.GET));
app.put("/api/proxy-pools/:id", adapt(proxyPoolsIdRoute.PUT));
app.delete("/api/proxy-pools/:id", adapt(proxyPoolsIdRoute.DELETE));
app.post("/api/proxy-pools/:id/test", adapt(proxyPoolsIdTestRoute.POST));
app.post("/api/proxy-pools/cloudflare-deploy", adapt(proxyPoolsCloudflareRoute.POST));
app.post("/api/proxy-pools/deno-deploy", adapt(proxyPoolsDenoRoute.POST));
app.post("/api/proxy-pools/netlify-deploy", adapt(proxyPoolsNetlifyRoute.POST));
app.post("/api/proxy-pools/vercel-deploy", adapt(proxyPoolsVercelRoute.POST));

// Tags & Pricing
app.get("/api/tags", adapt(tagsRoute.GET));
app.get("/api/pricing", adapt(pricingRoute.GET));
app.patch("/api/pricing", adapt(pricingRoute.PATCH));
app.delete("/api/pricing", adapt(pricingRoute.DELETE));

// Translator
app.get("/api/translator/load", adapt(translatorLoadRoute.GET));
app.post("/api/translator/save", adapt(translatorSaveRoute.POST));
app.post("/api/translator/send", adapt(translatorSendRoute.POST));
app.post("/api/translator/translate", adapt(translatorTranslateRoute.POST));

// MCP
app.post("/api/mcp/:plugin/message", adapt(mcpMessageRoute.POST));
app.get("/api/mcp/:plugin/sse", adapt(mcpSseRoute.GET));

// Media Providers
app.get("/api/media-providers/tts/voices", adapt(mediaTtsVoicesRoute.GET));
app.get("/api/media-providers/tts/deepgram/voices", adapt(mediaTtsDeepgramRoute.GET));
app.get("/api/media-providers/tts/elevenlabs/voices", adapt(mediaTtsElevenlabsRoute.GET));
app.get("/api/media-providers/tts/inworld/voices", adapt(mediaTtsInworldRoute.GET));
app.get("/api/media-providers/tts/minimax/voices", adapt(mediaTtsMinimaxRoute.GET));

// Cron
app.get("/api/cron/refresh-token", adapt(cronRefreshTokenRoute.GET));
app.post("/api/cron/refresh-token", adapt(cronRefreshTokenRoute.POST));

// CLI Tools
app.get("/api/cli-tools/all-statuses", adapt(cliAllStatusesRoute.GET));
app.get("/api/cli-tools/claude-settings", adapt(cliClaudeSettingsRoute.GET));
app.post("/api/cli-tools/claude-settings", adapt(cliClaudeSettingsRoute.POST));
app.delete("/api/cli-tools/claude-settings", adapt(cliClaudeSettingsRoute.DELETE));
app.get("/api/cli-tools/cline-settings", adapt(cliClineSettingsRoute.GET));
app.post("/api/cli-tools/cline-settings", adapt(cliClineSettingsRoute.POST));
app.delete("/api/cli-tools/cline-settings", adapt(cliClineSettingsRoute.DELETE));
app.get("/api/cli-tools/codex-settings", adapt(cliCodexSettingsRoute.GET));
app.post("/api/cli-tools/codex-settings", adapt(cliCodexSettingsRoute.POST));
app.delete("/api/cli-tools/codex-settings", adapt(cliCodexSettingsRoute.DELETE));
app.get("/api/cli-tools/codex-profiles", adapt(cliCodexProfilesRoute.GET));
app.post("/api/cli-tools/codex-profiles", adapt(cliCodexProfilesRoute.POST));
app.delete("/api/cli-tools/codex-profiles", adapt(cliCodexProfilesRoute.DELETE));
app.get("/api/cli-tools/cowork-settings", adapt(cliCoworkSettingsRoute.GET));
app.post("/api/cli-tools/cowork-settings", adapt(cliCoworkSettingsRoute.POST));
app.delete("/api/cli-tools/cowork-settings", adapt(cliCoworkSettingsRoute.DELETE));
app.post("/api/cli-tools/cowork-mcp-tools", adapt(cliCoworkMcpToolsRoute.POST));
app.get("/api/cli-tools/cowork-mcp-registry", adapt(cliCoworkMcpRegistryRoute.GET));
app.get("/api/cli-tools/crush-settings", adapt(cliCrushSettingsRoute.GET));
app.post("/api/cli-tools/crush-settings", adapt(cliCrushSettingsRoute.POST));
app.delete("/api/cli-tools/crush-settings", adapt(cliCrushSettingsRoute.DELETE));
app.get("/api/cli-tools/deepseek-tui-settings", adapt(cliDeepseekTuiSettingsRoute.GET));
app.post("/api/cli-tools/deepseek-tui-settings", adapt(cliDeepseekTuiSettingsRoute.POST));
app.delete("/api/cli-tools/deepseek-tui-settings", adapt(cliDeepseekTuiSettingsRoute.DELETE));
app.get("/api/cli-tools/devin-settings", adapt(cliDevinSettingsRoute.GET));
app.get("/api/cli-tools/droid-settings", adapt(cliDroidSettingsRoute.GET));
app.post("/api/cli-tools/droid-settings", adapt(cliDroidSettingsRoute.POST));
app.delete("/api/cli-tools/droid-settings", adapt(cliDroidSettingsRoute.DELETE));
app.get("/api/cli-tools/forge-settings", adapt(cliForgeSettingsRoute.GET));
app.post("/api/cli-tools/forge-settings", adapt(cliForgeSettingsRoute.POST));
app.delete("/api/cli-tools/forge-settings", adapt(cliForgeSettingsRoute.DELETE));
app.get("/api/cli-tools/grok-build-settings", adapt(cliGrokBuildSettingsRoute.GET));
app.post("/api/cli-tools/grok-build-settings", adapt(cliGrokBuildSettingsRoute.POST));
app.delete("/api/cli-tools/grok-build-settings", adapt(cliGrokBuildSettingsRoute.DELETE));
app.get("/api/cli-tools/hermes-settings", adapt(cliHermesSettingsRoute.GET));
app.post("/api/cli-tools/hermes-settings", adapt(cliHermesSettingsRoute.POST));
app.delete("/api/cli-tools/hermes-settings", adapt(cliHermesSettingsRoute.DELETE));
app.get("/api/cli-tools/hermes-profiles", adapt(cliHermesProfilesRoute.GET));
app.get("/api/cli-tools/jcode-settings", adapt(cliJcodeSettingsRoute.GET));
app.post("/api/cli-tools/jcode-settings", adapt(cliJcodeSettingsRoute.POST));
app.delete("/api/cli-tools/jcode-settings", adapt(cliJcodeSettingsRoute.DELETE));
app.get("/api/cli-tools/kilo-settings", adapt(cliKiloSettingsRoute.GET));
app.post("/api/cli-tools/kilo-settings", adapt(cliKiloSettingsRoute.POST));
app.delete("/api/cli-tools/kilo-settings", adapt(cliKiloSettingsRoute.DELETE));
app.get("/api/cli-tools/omp-settings", adapt(cliOmpSettingsRoute.GET));
app.post("/api/cli-tools/omp-settings", adapt(cliOmpSettingsRoute.POST));
app.delete("/api/cli-tools/omp-settings", adapt(cliOmpSettingsRoute.DELETE));
app.get("/api/cli-tools/openclaw-settings", adapt(cliOpenclawSettingsRoute.GET));
app.post("/api/cli-tools/openclaw-settings", adapt(cliOpenclawSettingsRoute.POST));
app.delete("/api/cli-tools/openclaw-settings", adapt(cliOpenclawSettingsRoute.DELETE));
app.get("/api/cli-tools/opencode-settings", adapt(cliOpencodeSettingsRoute.GET));
app.post("/api/cli-tools/opencode-settings", adapt(cliOpencodeSettingsRoute.POST));
app.patch("/api/cli-tools/opencode-settings", adapt(cliOpencodeSettingsRoute.PATCH));
app.delete("/api/cli-tools/opencode-settings", adapt(cliOpencodeSettingsRoute.DELETE));
app.get("/api/cli-tools/pi-settings", adapt(cliPiSettingsRoute.GET));
app.post("/api/cli-tools/pi-settings", adapt(cliPiSettingsRoute.POST));
app.delete("/api/cli-tools/pi-settings", adapt(cliPiSettingsRoute.DELETE));
app.get("/api/cli-tools/smelt-settings", adapt(cliSmeltSettingsRoute.GET));
app.post("/api/cli-tools/smelt-settings", adapt(cliSmeltSettingsRoute.POST));
app.delete("/api/cli-tools/smelt-settings", adapt(cliSmeltSettingsRoute.DELETE));
app.get("/api/cli-tools/codewhale-settings", adapt(cliCodewhaleSettingsRoute.GET));
app.post("/api/cli-tools/codewhale-settings", adapt(cliCodewhaleSettingsRoute.POST));
app.delete("/api/cli-tools/codewhale-settings", adapt(cliCodewhaleSettingsRoute.DELETE));
app.get("/api/cli-tools/copilot-settings", adapt(cliCopilotSettingsRoute.GET));
app.post("/api/cli-tools/copilot-settings", adapt(cliCopilotSettingsRoute.POST));
app.delete("/api/cli-tools/copilot-settings", adapt(cliCopilotSettingsRoute.DELETE));
app.get("/api/cli-tools/antigravity-mitm", adapt(cliAntigravityMitmRoute.GET));
app.post("/api/cli-tools/antigravity-mitm", adapt(cliAntigravityMitmRoute.POST));
app.patch("/api/cli-tools/antigravity-mitm", adapt(cliAntigravityMitmRoute.PATCH));
app.delete("/api/cli-tools/antigravity-mitm", adapt(cliAntigravityMitmRoute.DELETE));
app.get("/api/cli-tools/antigravity-mitm/alias", adapt(cliAntigravityMitmAliasRoute.GET));
app.put("/api/cli-tools/antigravity-mitm/alias", adapt(cliAntigravityMitmAliasRoute.PUT));

// OAuth
app.get("/api/oauth/:provider/:action", adapt(oauthProviderActionRoute.GET));
app.post("/api/oauth/:provider/:action", adapt(oauthProviderActionRoute.POST));
app.post("/api/oauth/codex/bulk-import", adapt(oauthCodexBulkRoute.POST));
app.post("/api/oauth/codex/import-token", adapt(oauthCodexImportRoute.POST));
app.get("/api/oauth/cursor/auto-import", adapt(oauthCursorAutoRoute.GET));
app.get("/api/oauth/cursor/import", adapt(oauthCursorImportRoute.GET));
app.post("/api/oauth/cursor/import", adapt(oauthCursorImportRoute.POST));
app.post("/api/oauth/gitlab/pat", adapt(oauthGitlabPatRoute.POST));
app.post("/api/oauth/grok-cli/bulk-import", adapt(oauthGrokCliBulkRoute.POST));
app.post("/api/oauth/iflow/cookie", adapt(oauthIflowCookieRoute.POST));
app.post("/api/oauth/kiro/api-key", adapt(oauthKiroApiKeyRoute.POST));
app.get("/api/oauth/kiro/auto-import", adapt(oauthKiroAutoRoute.GET));
app.post("/api/oauth/kiro/import-cli-proxy", adapt(oauthKiroImportCliProxyRoute.POST));
app.post("/api/oauth/kiro/import", adapt(oauthKiroImportRoute.POST));
app.get("/api/oauth/kiro/social-authorize", adapt(oauthKiroSocialAuthRoute.GET));
app.post("/api/oauth/kiro/social-exchange", adapt(oauthKiroSocialExchangeRoute.POST));
app.post("/api/oauth/xiaomi-mimo/api-key", adapt(oauthXiaomiApiKeyRoute.POST));
app.get("/api/oauth/xiaomi-mimo/auto-import", adapt(oauthXiaomiAutoRoute.GET));
app.post("/api/oauth/xiaomi-mimo/login/start", adapt(oauthXiaomiLoginStartRoute.POST));
app.get("/api/oauth/xiaomi-mimo/login/status", adapt(oauthXiaomiLoginStatusRoute.GET));
app.get("/api/oauth/zed/auto-import", adapt(oauthZedAutoRoute.GET));
app.post("/api/oauth/zed/import", adapt(oauthZedImportRoute.POST));

// 6. AI Gateway Routes (/v1/* and /api/v1/*)
const registerAiRoutes = (prefix) => {
  app.post(`${prefix}/chat/completions`, adapt(v1ChatCompletionsRoute.POST));
  app.post(`${prefix}/messages`, adapt(v1MessagesRoute.POST));
  app.post(`${prefix}/messages/count_tokens`, adapt(v1MessagesCountTokensRoute.POST));
  app.get(`${prefix}/models/info`, adapt(v1ModelsInfoRoute.GET));
  app.get(`${prefix}/models`, adapt(v1ModelsRoute.GET));
  app.get(`${prefix}/models/:model{.*}`, adapt(v1ModelsModelRoute.GET));
  app.post(`${prefix}/embeddings`, adapt(v1EmbeddingsRoute.POST));
  app.post(`${prefix}/images/generations`, adapt(v1ImagesRoute.POST));
  app.post(`${prefix}/audio/speech`, adapt(v1AudioSpeechRoute.POST));
  app.post(`${prefix}/audio/transcriptions`, adapt(v1AudioTranscriptionsRoute.POST));
  app.get(`${prefix}/audio/voices`, adapt(v1AudioVoicesRoute.GET));
  app.post(`${prefix}/videos/generations`, adapt(v1VideosRoute.POST));
  app.post(`${prefix}/videos/edits`, adapt(v1VideosEditsRoute.POST));
  app.post(`${prefix}/videos/extensions`, adapt(v1VideosExtensionsRoute.POST));
  app.get(`${prefix}/videos/:id`, adapt(v1VideosIdRoute.GET));
  app.post(`${prefix}/web/fetch`, adapt(v1WebFetchRoute.POST));
  app.post(`${prefix}/responses`, adapt(v1ResponsesRoute.POST));
  app.post(`${prefix}/responses/compact`, adapt(v1ResponsesCompactRoute.POST));
  app.post(`${prefix}/systemone`, adapt(v1SystemoneRoute.POST));
  app.post(`${prefix}/search`, adapt(v1SearchRoute.POST));
};

registerAiRoutes("/v1");
registerAiRoutes("/api/v1");

// 7. Gemini Native API Routes (/v1beta/* and /api/v1beta/*)
app.get("/v1beta/models", adapt(v1betaModelsRoute.GET));
app.post("/v1beta/models/:path{.*}", adapt(v1betaModelsPathRoute.POST));
app.get("/api/v1beta/models", adapt(v1betaModelsRoute.GET));
app.post("/api/v1beta/models/:path{.*}", adapt(v1betaModelsPathRoute.POST));

// 8. Static Assets SPA Fallback
app.all("*", async (c) => {
  if (c.env?.ASSETS) {
    return c.env.ASSETS.fetch(c.req.raw);
  }
  return c.text("9Router Worker Active", 200);
});

export default app;
