import type { Locale } from "@/shared/locale";
import type { FeatureItem } from "@/shared/content-types";

type GovernanceCopy = {
  eyebrow: string;
  title: string;
  description: string;
  items: readonly FeatureItem[];
};

export const governanceContent: Record<Locale, GovernanceCopy> = {
  th: {
    eyebrow: "ความปลอดภัยและการกำกับดูแล",
    title: "การควบคุมที่องค์กรต้องการจริง ๆ",
    description:
      "การพัฒนาแอปด้วย AI จะมีประโยชน์กับองค์กรก็ต่อเมื่อทุกการสร้างงาน ทุกการปล่อยรุ่น และทุกการให้สิทธิ์เข้าถึง มีหลักฐานตรวจสอบย้อนหลังได้",
    items: [
      {
        title: "ปกป้องคีย์ผู้ให้บริการ",
        description:
          "API key ถูกเก็บไว้ใน secret store และถูกดึงมาใช้เฉพาะตอนเรียก request เท่านั้น ไม่ถูกเขียนฝังไว้ในโค้ดของโปรเจกต์"
      },
      {
        title: "โควตาและการควบคุมการใช้งาน",
        description: "กำหนดโควตาโทเคนต่อโปรเจกต์ ควบคุมพรอมป์ต์ด้วยเงื่อนไขการใช้งาน และบันทึกการใช้งานทุกครั้งที่สร้างงาน"
      },
      {
        title: "แยกระบบเป็นค่าเริ่มต้น",
        description: "แต่ละโปรเจกต์มี container รันงานและ schema ฐานข้อมูลเป็นของตัวเอง"
      },
      {
        title: "ลงชื่อเข้าใช้ครั้งเดียว (SSO)",
        description: "ใช้บัญชีของแพลตฟอร์มเอง หรือเชื่อมต่อกับผู้ให้บริการยืนยันตัวตนที่มีอยู่ผ่าน OIDC และ SAML"
      },
      {
        title: "ตรวจสอบก่อนเผยแพร่",
        description:
          "ทุกรุ่นที่จะปล่อยต้องผ่านการตรวจสอบว่าย้อนกลับได้อย่างปลอดภัยก่อนเผยแพร่เสมอ เพื่อไม่ให้การเปลี่ยนแปลงฐานข้อมูลที่ผิดพลาดทำให้แอปใช้งานต่อไม่ได้"
      },
      {
        title: "หลักฐานเพื่อการตรวจสอบ",
        description: "งาน พรีวิว การเผยแพร่ และการใช้งาน ถูกบันทึกไว้เพื่อทบทวนภายหลัง"
      }
    ] as const satisfies readonly FeatureItem[]
  },
  en: {
    eyebrow: "Security and governance",
    title: "The controls an enterprise product needs.",
    description:
      "AI-assisted delivery is only useful inside an enterprise if every generation, every release, and every access grant leaves evidence behind.",
    items: [
      {
        title: "Provider key protection",
        description:
          "API keys stay in a secret store and are injected at request time, never written into project code."
      },
      {
        title: "Quotas and guardrails",
        description: "Per-project token quotas, prompt guardrails, and usage recorded for every generation."
      },
      {
        title: "Isolation by default",
        description: "Each project gets its own runtime container and its own database schema."
      },
      {
        title: "Single sign-on",
        description: "Native accounts, or an existing identity provider over OIDC and SAML."
      },
      {
        title: "Pre-publish checks",
        description:
          "Every release is validated for rollback safety before it ships, so a bad migration cannot strand an app."
      },
      {
        title: "Audit evidence",
        description: "Tasks, previews, deployments, and usage are recorded for later review."
      }
    ] as const satisfies readonly FeatureItem[]
  }
};
