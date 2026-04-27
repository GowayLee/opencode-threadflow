export type Locale = "zh" | "en";

export const SUPPORTED_LOCALES: readonly Locale[] = ["zh", "en"] as const;
export const DEFAULT_LOCALE: Locale = "en";
