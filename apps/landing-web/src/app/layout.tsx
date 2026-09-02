import type { Metadata } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";
import { SiteFooter } from "@/shared/site-footer";
import { SiteNav } from "@/shared/site-nav";
import { siteUrl } from "@/shared/site-config";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

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
    <html lang="en" className={inter.variable}>
      <body className="bg-page text-body min-h-screen antialiased">
        <SiteNav />
        {children}
        <SiteFooter />
      </body>
    </html>
  );
}
