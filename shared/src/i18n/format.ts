import zh from "./zh-CN.json";
import en from "./en.json";

export type Locale = "zh-CN" | "en";
export type MessageKey = keyof typeof zh;
export type MessageValues = Record<string, string | number>;
const messages: Record<Locale, Record<MessageKey, string>> = { "zh-CN": zh, en };

export function isLocale(value: unknown): value is Locale {
  return value === "zh-CN" || value === "en";
}

/** Literal text with named placeholders; never interpret translated text as HTML. */
export function message(locale: Locale, key: MessageKey) {
  return messages[locale][key] ?? zh[key];
}

export function translate(locale: Locale, key: MessageKey, values: MessageValues = {}) {
  return message(locale, key).replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    Object.hasOwn(values, name) ? String(values[name]) : placeholder,
  );
}
