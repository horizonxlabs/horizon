import type { Locale } from "@/shared/locale";
import type { FeatureItem } from "@/shared/content-types";

type LifecycleCopy = {
  eyebrow: string;
  title: string;
  description: string;
  steps: readonly FeatureItem[];
};

export const lifecycleContent: Record<Locale, LifecycleCopy> = {
  th: {
    eyebrow: "ขั้นตอนการทำงาน",
    title: "จากประโยคเดียว สู่แอปพลิเคชันที่ใช้งานได้จริง",
    description: "ทุกขั้นตอนถูกบันทึกไว้ จึงย้อนกลับไปดูได้เสมอว่าแอปที่ส่งมอบมาจากความต้องการใด",
    steps: [
      {
        title: "ไอเดีย",
        description: "ผู้ใช้ในองค์กรอธิบายแอปที่ต้องการด้วยภาษาที่เข้าใจง่าย"
      },
      {
        title: "PRD",
        description: "แพลตฟอร์มแปลงความต้องการให้เป็น PRD ที่มีโครงสร้างชัดเจนสำหรับตรวจทาน"
      },
      {
        title: "เวิร์กสเปซ AI",
        description: "ระบบสร้างงานด้วย AI เขียนและแก้ไขแอปภายในเวิร์กสเปซเฉพาะของแต่ละโปรเจกต์"
      },
      {
        title: "พรีวิว",
        description: "เวิร์กสเปซรันอยู่จริงใน container เข้าถึงได้ผ่าน URL พรีวิวของตัวเอง"
      },
      {
        title: "เผยแพร่",
        description:
          "ทุกรุ่นที่จะปล่อยต้องผ่านการตรวจสอบว่าย้อนกลับได้อย่างปลอดภัยก่อนเสมอ จากนั้นแอปจะปรากฏใน App Store ภายในองค์กร"
      }
    ] as const satisfies readonly FeatureItem[]
  },
  en: {
    eyebrow: "How it works",
    title: "From a sentence to a deployed application.",
    description:
      "Every step leaves a record, so a delivered application can be traced back to the requirement that asked for it.",
    steps: [
      {
        title: "Idea",
        description: "An enterprise user describes the app they need in plain language."
      },
      {
        title: "PRD",
        description: "The platform turns the requirement into a structured PRD for review."
      },
      {
        title: "AI workspace",
        description: "An AI generation loop writes and edits the app inside a per-project workspace."
      },
      {
        title: "Preview",
        description: "The workspace runs live in a container, reachable at its own preview URL."
      },
      {
        title: "Publish",
        description:
          "The release is checked for rollback safety, then the app appears in the internal App Store."
      }
    ] as const satisfies readonly FeatureItem[]
  }
};
