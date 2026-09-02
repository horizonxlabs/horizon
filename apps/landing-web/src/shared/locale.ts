export const LOCALES = ["th", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "th";

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** Shared prop shape for sections and chrome that receive the active locale. Optional so
 * existing callers (and render-smoke tests) that omit it keep compiling — Task 3 wires the
 * actual translations through this prop. */
export type LocaleProps = { locale?: Locale };
