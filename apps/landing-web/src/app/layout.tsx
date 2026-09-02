import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { SiteFooter } from "@/shared/site-footer";
import { SiteNav } from "@/shared/site-nav";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:4103";

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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-page text-body min-h-screen antialiased">
        <SiteNav />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
