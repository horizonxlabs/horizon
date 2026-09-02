import type { Locale } from "@/shared/locale";
import type { LinkAction, StatusRow } from "@/shared/content-types";
import { siteConfig } from "@/shared/site-config";

type HeroCopy = {
  eyebrow: string;
  headline: string;
  subhead: string;
  actions: readonly LinkAction[];
  // Decorative product-visual rows (aria-hidden — see hero-product-visual.tsx), still
  // locale-keyed like every other piece of copy on the page. Each row must describe something
  // the product actually does: PRD versioning, the per-project workspace container, checkpoint
  // previews, and pre-publish checks are all real (see docs/architecture and the governance
  // section copy below) — no invented approval counts or policies.
  visualRows: readonly StatusRow[];
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
    ] as const satisfies readonly LinkAction[],
    visualRows: [
      { label: "PRD ฐาน", value: "v4 · อนุมัติแล้ว" },
      { label: "เวิร์กสเปซ", value: "container กำลังทำงาน" },
      { label: "พรีวิว", value: "จุดตรวจที่ 12" },
      { label: "ตรวจสอบก่อนเผยแพร่", value: "ผ่านแล้ว" }
    ] as const satisfies readonly StatusRow[]
  },
  en: {
    eyebrow: "Open source · self-hosted",
    headline: "Ship internal software at AI speed — under enterprise control.",
    subhead:
      "Horizon turns a requirement into a product requirements document, an AI-built workspace, and a governed deployment, all inside infrastructure you own.",
    actions: [
      { label: "Get started", href: "#self-host" },
      { label: "View on GitHub", href: siteConfig.repositoryUrl, external: true }
    ] as const satisfies readonly LinkAction[],
    visualRows: [
      { label: "PRD baseline", value: "v4 · approved" },
      { label: "Workspace", value: "container running" },
      { label: "Preview", value: "checkpoint 12" },
      { label: "Pre-publish checks", value: "passed" }
    ] as const satisfies readonly StatusRow[]
  }
};
