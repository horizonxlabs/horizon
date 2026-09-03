import type { MetadataRoute } from "next";
import { siteUrl } from "@/shared/site-config";

// Lives at the app root, not under `[lang]` — same metadata-route constraint as sitemap.ts.
// robots.txt is not localized: a single Sitemap: line at the site root, pointing at the one
// sitemap.xml that itself lists both locales.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: `${siteUrl}/sitemap.xml`
  };
}
