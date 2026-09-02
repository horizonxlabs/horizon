import { ActionButton } from "@/shared/action-button";
import type { LocaleProps } from "@/shared/locale";
import { siteConfig } from "@/shared/site-config";
import { footerContent } from "./site-footer-content";

export function SiteFooter({ locale }: LocaleProps) {
  const copy = footerContent[locale];
  return (
    <footer className="bg-surface border-border-soft border-t px-6 py-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted text-sm">{copy.tagline}</p>
        <ActionButton
          action={{ label: copy.sourceLabel, href: siteConfig.repositoryUrl, external: true }}
          variant="link"
        />
      </div>
    </footer>
  );
}
