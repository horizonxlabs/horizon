import type { MetadataRoute } from "next";
import { siteUrl } from "@/shared/site-config";
import { LOCALES } from "@/shared/locale";

// Lives at the app root, not under `[lang]` — Next's metadata-route conventions require
// sitemap.ts at the app root, and nesting it under a dynamic segment silently breaks it (see
// tests/unit/landing-web-i18n.test.mjs). One entry per locale, driven from LOCALES, each
// cross-referencing every locale via `alternates.languages`.
export default function sitemap(): MetadataRoute.Sitemap {
  const languages = Object.fromEntries(LOCALES.map((locale) => [locale, `${siteUrl}/${locale}`]));
  return LOCALES.map((locale) => ({
    url: `${siteUrl}/${locale}`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 1,
    alternates: { languages }
  }));
}
