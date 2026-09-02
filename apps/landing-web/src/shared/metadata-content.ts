import type { Locale } from "@/shared/locale";

type MetadataCopy = { title: string; description: string };

export const metadataContent: Record<Locale, MetadataCopy> = {
  th: {
    title: "Horizon — เครื่องมือสร้างแอปพลิเคชัน AI สำหรับองค์กร",
    description:
      "เปลี่ยนความต้องการให้เป็นแอปพลิเคชันภายในองค์กรที่มีการกำกับดูแล บนโครงสร้างพื้นฐานที่คุณควบคุมเอง"
  },
  en: {
    title: "Horizon — enterprise AI application builder",
    description:
      "Turn a requirement into a governed internal application, on infrastructure you control."
  }
};
