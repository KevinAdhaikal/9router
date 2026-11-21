// Logger utility (NO LOG mode)

export function nextTag() {
  return "";
}

export function tagForSession() {
  return "";
}

export function line() {}

export function errorLine() {}

export function fmtThink() {
  return null;
}

export function debug() {}

export function info() {}

export function warn() {}

export function error() {}

export function request() {}

export function response() {}

export function stream() {}

export function maskKey(key) {
  if (!key || key.length < 8) return "***";
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}
