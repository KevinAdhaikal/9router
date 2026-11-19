// Polyfill MessagePort, MessageChannel, FinalizationRegistry, and WeakRef
// for Cloudflare Workers (workerd) where undici / fetch expects them on globalThis.

if (typeof globalThis.MessagePort === "undefined") {
  globalThis.MessagePort = class MessagePort {};
}

if (typeof globalThis.MessageChannel === "undefined") {
  globalThis.MessageChannel = class MessageChannel {
    constructor() {
      this.port1 = new globalThis.MessagePort();
      this.port2 = new globalThis.MessagePort();
    }
  };
}

if (typeof globalThis.FinalizationRegistry === "undefined") {
  globalThis.FinalizationRegistry = class FinalizationRegistry {
    constructor() {}
    register() {}
    unregister() {
      return false;
    }
  };
}

if (typeof globalThis.WeakRef === "undefined") {
  globalThis.WeakRef = class WeakRef {
    constructor(target) {
      this.target = target;
    }
    deref() {
      return this.target;
    }
  };
}
