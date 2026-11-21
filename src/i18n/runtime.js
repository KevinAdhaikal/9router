"use client";

import { DEFAULT_LOCALE } from "./config";

// English only: pass text through as-is
export function translate(text) {
  return text;
}

export function getCurrentLocale() {
  return DEFAULT_LOCALE;
}

export function onLocaleChange() {
  return () => {};
}

export function reloadTranslations() {}

export function initRuntimeI18n() {}
