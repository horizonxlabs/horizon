import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { notFound } from "next/navigation";
import "./globals.css";
import { SiteFooter } from "@/shared/site-footer";
import { SiteNav } from "@/shared/site-nav";
import { siteUrl } from "@/shared/site-config";
import { LOCALES, isLocale } from "@/shared/locale";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

// Prerenders every supported locale route: "th" (the default) and "en".
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Horizon — enterprise AI application builder",
  description:
    "Turn a requirement into a governed internal application, on infrastructure you control.",
  openGraph: {
    title: "Horizon — enterprise AI application builder",
    description:
      "Turn a requirement into a governed internal application, on infrastructure you control.",
    url: siteUrl,
    siteName: "Horizon",
    type: "website"
  }
};

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
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
