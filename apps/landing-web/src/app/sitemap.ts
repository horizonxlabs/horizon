import type { MetadataRoute } from "next";
import { siteUrl } from "@/shared/site-config";
import { DEFAULT_LOCALE, LOCALES } from "@/shared/locale";

// Lives at the app root, not under `[lang]` — Next's metadata-route conventions require
// sitemap.ts at the app root, and nesting it under a dynamic segment silently breaks it (see
// tests/unit/landing-web-i18n.test.mjs). One entry per locale, driven from LOCALES, each
// cross-referencing every locale via `alternates.languages`.
export default function sitemap(): MetadataRoute.Sitemap {
  // `x-default` points at `/th`, matching `/[lang]/layout.tsx`'s `generateMetadata`: the site
  // root only 308-redirects to `/th` (see proxy.ts), and hreflang consumers expect the default
  // target to be a canonical, non-redirecting URL rather than one that forwards them again.
  const languages = {
    ...Object.fromEntries(LOCALES.map((locale) => [locale, `${siteUrl}/${locale}`])),
    "x-default": `${siteUrl}/${DEFAULT_LOCALE}`
  };
  return LOCALES.map((locale) => ({
    url: `${siteUrl}/${locale}`,
    lastModified: new Date(),
    changeFrequency: "monthly",
    priority: 1,
    alternates: { languages }
  }));
}
