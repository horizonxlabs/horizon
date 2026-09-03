import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import "./globals.css";
import { SiteFooter } from "@/features/site-footer";
import { SiteNav } from "@/shared/site-nav";
import { siteUrl } from "@/shared/site-config";
import type { Locale } from "@/shared/locale";
import { DEFAULT_LOCALE, LOCALES, isLocale } from "@/shared/locale";
import { metadataContent } from "@/shared/metadata-content";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

// Prerenders every supported locale route: "th" (the default) and "en".
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

// OpenGraph locale codes are a protocol detail, not user-facing copy, so they live next to the
// metadata they annotate rather than under the Thai-script content guards.
const openGraphLocale: Record<Locale, string> = { th: "th_TH", en: "en_US" };

// Typed explicitly rather than with Next's generated route-props helper for this path: that
// helper only resolves after `next build` writes .next/types/routes.d.ts, which doesn't exist
// on a fresh clone or in CI before the build step runs, so depending on it breaks `pnpm typecheck`.
export async function generateMetadata({
  params
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const copy = metadataContent[lang];
  // Driven from LOCALES rather than hardcoded, so a third locale only needs adding there.
  // `x-default` points at `/th` rather than the site root: the root only 308-redirects to `/th`
  // (see proxy.ts), and hreflang consumers expect the default target to be a canonical,
  // non-redirecting URL rather than one that forwards them again.
  const languages = {
    ...Object.fromEntries(LOCALES.map((locale) => [locale, `/${locale}`])),
    "x-default": `${siteUrl}/${DEFAULT_LOCALE}`
  };
  return {
    metadataBase: new URL(siteUrl),
    title: copy.title,
    description: copy.description,
    alternates: {
      canonical: `/${lang}`,
      languages
    },
    openGraph: {
      title: copy.title,
      description: copy.description,
      url: `/${lang}`,
      siteName: "Horizon",
      type: "website",
      locale: openGraphLocale[lang]
    }
  };
}

// Same reasoning as generateMetadata above: explicit prop types avoid depending on the
// generated route-type helper that is unavailable exactly when CI needs it.
export default async function RootLayout({
  children,
  params
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return (
    <html lang={lang} className={inter.variable}>
      <body className="bg-page text-body min-h-screen antialiased">
        <SiteNav locale={lang} />
        {children}
        <SiteFooter locale={lang} />
      </body>
    </html>
  );
}
