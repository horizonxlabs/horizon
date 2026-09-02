import type { Locale } from "@/shared/locale";
import { siteConfig } from "@/shared/site-config";

type FooterCopy = {
  tagline: string;
  sourceLabel: string;
};

export const footerContent: Record<Locale, FooterCopy> = {
  th: {
    tagline: `${siteConfig.name} — เครื่องมือสร้างแอปพลิเคชัน AI สำหรับองค์กร พัฒนาแบบเปิดเผย`,
    sourceLabel: "ดูซอร์สโค้ด"
  },
  en: {
    tagline: `${siteConfig.name} — enterprise AI application builder, developed in the open.`,
    sourceLabel: "View the source"
  }
};
