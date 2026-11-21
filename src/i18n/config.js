export const LOCALES = ["en"];
export const DEFAULT_LOCALE = "en";
export const LOCALE_COOKIE = "locale";

export const LOCALE_NAMES = {
  en: "English",
};

export function normalizeLocale(locale) {
  return "en";
}

export function isSupportedLocale(locale) {
  return locale === "en";
}
