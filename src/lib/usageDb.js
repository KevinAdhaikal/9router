// Usage tracking disabled for lightweight Cloudflare Workers deployment
export const statsEmitter = {
  on: () => {},
  emit: () => {},
  removeListener: () => {},
};

export function trackPendingRequest() {}
export function getActiveRequests() {
  return 0;
}
export async function saveRequestUsage() {}
export async function getUsageHistory() {
  return [];
}
export async function getUsageStats() {
  return { requests: 0, tokens: 0, cost: 0 };
}
export async function getChartData() {
  return [];
}
export async function appendRequestLog() {}
export async function getRecentLogs() {
  return [];
}
export async function saveRequestDetail() {}
export async function getRequestDetails() {
  return { items: [], total: 0 };
}
export async function getRequestDetailById() {
  return null;
}
export async function getDistinctProviders() {
  return [];
}
