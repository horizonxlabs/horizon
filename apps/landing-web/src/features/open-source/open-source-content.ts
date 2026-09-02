import type { Locale } from "@/shared/locale";
import type { LinkAction } from "@/shared/content-types";
import { siteConfig } from "@/shared/site-config";

type OpenSourceCopy = {
  eyebrow: string;
  title: string;
  description: string;
  action: LinkAction;
};

export const openSourceContent: Record<Locale, OpenSourceCopy> = {
  th: {
    eyebrow: "โอเพนซอร์ส",
    title: "พัฒนาแบบเปิดเผยตลอดกระบวนการ",
    description:
      "เอกสาร architecture decision records อธิบายเหตุผลเบื้องหลังการออกแบบแพลตฟอร์มนี้ — อ่านก่อนตัดสินใจนำไปใช้ จากนั้นลองรันเองและเปิด issue ได้เลย",
    action: {
      label: "อ่านซอร์สโค้ด",
      href: siteConfig.repositoryUrl,
      external: true
    } satisfies LinkAction
  },
  en: {
    eyebrow: "Open source",
    title: "Developed in the open.",
    description:
      "The architecture decision records explain why the platform is shaped the way it is — read them before you commit to it, then run it yourself and open an issue.",
    action: {
      label: "Read the source",
      href: siteConfig.repositoryUrl,
      external: true
    } satisfies LinkAction
  }
};
