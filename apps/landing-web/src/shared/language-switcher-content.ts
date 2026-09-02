import type { Locale } from "@/shared/locale";

/**
 * Each entry names its own language, in its own script — the `th` label is always written in
 * Thai and the `en` label is always written in English, regardless of which locale page the
 * switcher renders on (a language switcher that translated "Thai"/"English" into the viewer's
 * current language would be unreadable to someone who can't already read that language). The
 * record still keys by `Locale` and stays `Record<Locale, {...}>` shaped so it falls under the
 * same completeness and Thai-script guards in `tests/unit/landing-web-i18n.test.mjs` as every
 * other locale-keyed content module.
 */
export const languageSwitcherContent: Record<Locale, { label: string }> = {
  th: { label: "ไทย" },
  en: { label: "English" }
};
