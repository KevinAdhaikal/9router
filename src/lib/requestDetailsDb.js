// Request details tracking disabled for lightweight Cloudflare Workers deployment
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
