import Image from "next/image";
import { ActionButton } from "@/shared/action-button";
import { siteConfig } from "@/shared/site-config";

export function SiteNav() {
  return (
    <header className="bg-surface/80 border-border-soft sticky top-0 z-50 border-b backdrop-blur">
      <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
        <a href="#top" className="flex items-center">
          <Image
            src="/horizon-logo.png"
            alt={`${siteConfig.name} — enterprise AI application builder`}
            width={984}
            height={254}
            preload
            className="h-7 w-auto"
          />
        </a>
        <ul className="hidden items-center gap-8 md:flex">
          {siteConfig.navItems.map((item) => (
            <li key={item.href}>
              <a href={item.href} className="text-muted hover:text-body text-sm transition-colors">
                {item.label}
              </a>
            </li>
          ))}
        </ul>
        <ActionButton
          action={{ label: "GitHub", href: siteConfig.repositoryUrl, external: true }}
          variant="secondary"
        />
      </nav>
    </header>
  );
}
