/**
 * Lightweight in-memory cache with TTL and LRU cap.
 * Zero-overhead, synchronous, ideal for Cloudflare Worker isolate reuse.
 */
export function createMemoryCache(defaultTtlMs = 30000, maxSize = 500) {
  const store = new Map();

  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return null;
      if (Date.now() > entry.expiresAt) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    set(key, value, ttlMs = defaultTtlMs) {
      if (store.size >= maxSize) {
        const oldest = store.keys().next().value;
        store.delete(oldest);
      }
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
    delete(key) {
      store.delete(key);
    },
    clear() {
      store.clear();
    }
  };
}
