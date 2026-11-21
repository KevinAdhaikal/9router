/**
 * Display banner (plain text fallback)
 */
export function showBanner() {
  console.log("\n--- 9Router AI Gateway ---\n");
}

export function showSimpleBanner() {
  console.log("\n--- 9Router AI Gateway ---\n");
}

export async function showSuccess(message) {
  console.log(`\n✨ ${message}\n`);
}

export function showLoading(text) {
  return { stop: () => {} };
}
