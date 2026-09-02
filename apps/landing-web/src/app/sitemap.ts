import type { MetadataRoute } from "next";
import { siteUrl } from "@/shared/site-config";
import { LOCALES } from "@/shared/locale";

// Lives at the app root, not under `[lang]` — Next's metadata-route conventions require
// sitemap.ts at the app root, and nesting it under a dynamic segment silently breaks it (see
// tests/unit/landing-web-i18n.test.mjs). One entry per locale, driven from LOCALES, each
// cross-referencing every locale via `alternates.languages`.
export default function sitemap(): MetadataRoute.Sitemap {
  // `x-default` points at the site root, matching `/[lang]/layout.tsx`'s `generateMetadata`:
  // `/` already redirects to `/th`, so the root URL is the language-selection signal.
  const languages = {
    ...Object.fromEntries(LOCALES.map((locale) => [locale, `${siteUrl}/${locale}`])),
    "x-default": siteUrl
  };
  return LOCALES.map((locale) => ({
    url: `${siteUrl}/${locale}`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 1,
    alternates: { languages }
  }));
}
