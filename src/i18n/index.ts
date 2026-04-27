import type { Locale } from "./types";
import { DEFAULT_LOCALE } from "./types";
import { en } from "./en";
import { zh } from "./zh";

export type { Locale } from "./types";
export { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "./types";

type Messages = Record<string, string>;

const messages: Record<Locale, Messages> = { zh, en };

export type MessageKey = keyof typeof en;

export function t(
  locale: Locale,
  key: MessageKey,
  params?: Record<string, string>,
): string {
  const bundle = messages[locale];
  const fallback = messages[DEFAULT_LOCALE];

  let template: string | undefined = bundle[key];
  if (template === undefined) {
    template = fallback[key];
  }
  if (template === undefined) {
    return `[missing: ${key}]`;
  }

  if (!params) {
    return template;
  }

  return template.replace(
    /\{(\w+)\}/g,
    (_, k: string) => params[k] ?? `{${k}}`,
  );
}
