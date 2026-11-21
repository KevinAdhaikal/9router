/**
 * UI Helper Functions (Plain console logging without chalk/ora)
 */

export function success(message) {
  console.log(`\n✓ ${message}\n`);
}

export function error(message) {
  console.error(`\n✗ ${message}\n`);
}

export function info(message) {
  console.log(`\n${message}\n`);
}

export function warn(message) {
  console.warn(`\n⚠ ${message}\n`);
}

export function gray(message) {
  console.log(message);
}

export function spinner(text) {
  return {
    start: function () { return this; },
    stop: function () { return this; },
    succeed: function (msg) { if (msg) console.log(`✓ ${msg}`); return this; },
    fail: function (msg) { if (msg) console.error(`✗ ${msg}`); return this; },
    warn: function (msg) { if (msg) console.warn(`⚠ ${msg}`); return this; },
    text: text || "",
  };
}

export function printSection(title) {
  console.log(`\n${title}\n`);
}

export function printKeyValue(key, value, isSuccess = false) {
  console.log(`  ${key}: ${value}`);
}

export function printList(items, isSuccess = false) {
  const symbol = isSuccess ? "✓" : "✗";
  items.forEach((item) => {
    console.log(`  ${symbol} ${item}`);
  });
}
