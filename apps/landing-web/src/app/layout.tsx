import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { SiteFooter } from "@/shared/site-footer";
import { SiteNav } from "@/shared/site-nav";

export const metadata: Metadata = {
  title: "Horizon — enterprise AI application builder",
  description:
    "Turn a requirement into a governed internal application, on infrastructure you control."
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
