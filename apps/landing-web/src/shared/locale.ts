export const LOCALES = ["th", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "th";

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/** Shared prop shape for sections and chrome that receive the active locale. Required: every
 * caller threads the active locale through explicitly, so an omitted prop is a real bug (a
 * section silently rendering the default locale on the other locale's page) rather than a
 * convenience default — making it required turns that into a typecheck error. */
export type LocaleProps = { locale: Locale };
