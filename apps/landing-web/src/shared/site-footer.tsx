import { ActionButton } from "@/shared/action-button";
import type { Locale, LocaleProps } from "@/shared/locale";
import { DEFAULT_LOCALE } from "@/shared/locale";
import { siteConfig } from "@/shared/site-config";

const footerCopy: Record<Locale, { tagline: string; sourceLabel: string }> = {
  th: {
    tagline: `${siteConfig.name} — เครื่องมือสร้างแอปพลิเคชัน AI สำหรับองค์กร พัฒนาแบบเปิดเผย`,
    sourceLabel: "ดูซอร์สโค้ด"
  },
  en: {
    tagline: `${siteConfig.name} — enterprise AI application builder, developed in the open.`,
    sourceLabel: "View the source"
  }
};

export function SiteFooter({ locale = DEFAULT_LOCALE }: LocaleProps) {
  const copy = footerCopy[locale];
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
