let currentCookieHeader = "";

export function setCurrentCookieHeader(h) {
  currentCookieHeader = h || "";
}

export async function cookies() {
  const jar = new Map();
  if (currentCookieHeader) {
    for (const pair of currentCookieHeader.split(";")) {
      const idx = pair.indexOf("=");
      if (idx !== -1) {
        jar.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
      }
    }
  }
  return {
    get(name) {
      const val = jar.get(name);
      return val !== undefined ? { name, value: val } : undefined;
    },
    getAll() {
      return Array.from(jar.entries()).map(([name, value]) => ({ name, value }));
    },
    set(name, value) {
      jar.set(name, value);
    },
    delete(name) {
      jar.delete(name);
    }
  };
}

export async function headers() {
  return new Headers();
}
