import type { Locale } from "@/shared/locale";
import type { LinkAction } from "@/shared/content-types";
import { siteConfig } from "@/shared/site-config";

type HeroCopy = {
  eyebrow: string;
  headline: string;
  subhead: string;
  actions: readonly LinkAction[];
};

export const heroContent: Record<Locale, HeroCopy> = {
  th: {
    eyebrow: "โอเพนซอร์ส · ติดตั้งบนเซิร์ฟเวอร์ของคุณเอง",
    headline: "ส่งมอบซอฟต์แวร์องค์กรเร็วด้วย AI — ควบคุมได้เต็มที่",
    subhead:
      "Horizon เปลี่ยนความต้องการให้เป็นเอกสาร PRD เวิร์กสเปซที่ AI สร้างขึ้น และการดีพลอยที่ควบคุมและตรวจสอบได้ ทั้งหมดอยู่บนโครงสร้างพื้นฐานที่คุณเป็นเจ้าของเอง",
    actions: [
      { label: "เริ่มต้นใช้งาน", href: "#self-host" },
      { label: "ดูซอร์สโค้ดบน GitHub", href: siteConfig.repositoryUrl, external: true }
    ] as const satisfies readonly LinkAction[]
  },
  en: {
    eyebrow: "Open source · self-hosted",
    headline: "Ship internal software at AI speed — under enterprise control.",
    subhead:
      "Horizon turns a requirement into a product requirements document, an AI-built workspace, and a governed deployment, all inside infrastructure you own.",
    actions: [
      { label: "Get started", href: "#self-host" },
      { label: "View on GitHub", href: siteConfig.repositoryUrl, external: true }
    ] as const satisfies readonly LinkAction[]
  }
};
