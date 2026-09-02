import { ActionButton } from "@/shared/action-button";
import { siteConfig } from "@/shared/site-config";

export function SiteFooter() {
  return (
    <footer className="bg-surface border-border-soft border-t px-6 py-12">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted text-sm">
          {siteConfig.name} — enterprise AI application builder, developed in the open.
        </p>
        <ActionButton
          action={{ label: "View the source", href: siteConfig.repositoryUrl, external: true }}
          variant="link"
        />
      </div>
    </footer>
  );
}
