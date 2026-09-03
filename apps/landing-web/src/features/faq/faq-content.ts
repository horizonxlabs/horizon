import type { Locale } from "@/shared/locale";

export type FaqEntry = { question: string; answer: string };

type FaqCopy = {
  eyebrow: string;
  title: string;
  entries: readonly FaqEntry[];
};

export const faqContent: Record<Locale, FaqCopy> = {
  th: {
    eyebrow: "คำถามที่พบบ่อย",
    title: "คำถามที่ควรถามก่อนเริ่มใช้งาน",
    entries: [
      {
        question: "ใช้โมเดล AI ตัวไหนได้บ้าง",
        answer:
          "ตั้งค่าผู้ให้บริการผ่าน gateway ได้ ทำให้ Horizon เรียกใช้โมเดลที่องค์กรของคุณอนุมัติไว้แล้ว แทนที่จะผูกติดกับผู้ให้บริการรายใดรายหนึ่งตายตัว"
      },
      {
        question: "ข้อมูลของฉันถูกเก็บไว้ที่ไหน",
        answer:
          "อยู่บนเซิร์ฟเวอร์ของคุณเอง ทั้งฐานข้อมูล object storage และระบบยืนยันตัวตน ทำงานอยู่ภายในเครือข่ายของคุณทั้งหมด — ไม่มีข้อมูลใดออกไปจากเครือข่าย ยกเว้นการเรียกใช้งานไปยังผู้ให้บริการ AI ที่คุณตั้งค่าเอง"
      },
      {
        question: "รันบน Kubernetes ได้ไหม",
        answer:
          "รูปแบบการติดตั้งอ้างอิงคือ Docker Compose แพลตฟอร์มไม่ได้ hardcode ชื่อ service ของ Compose หรืออ้างอิง local filesystem ตายตัว จึงยังเปิดทางให้ย้ายไปใช้ Kubernetes ได้ในอนาคต"
      },
      {
        question: "พร้อมใช้งานจริงระดับ production หรือยัง",
        answer:
          "โปรเจกต์นี้ยังอยู่ระหว่างการพัฒนาอย่างต่อเนื่อง และทยอยส่งมอบเป็น sprint ที่มีลำดับ ควรอ่านเอกสาร architecture decision records เพื่อประเมินความเหมาะสมก่อนนำไปใช้งานจริง"
      }
    ] as const satisfies readonly FaqEntry[]
  },
  en: {
    eyebrow: "FAQ",
    title: "Questions worth asking first.",
    entries: [
      {
        question: "Which AI models can it use?",
        answer:
          "Providers are configured through a gateway, so Horizon points at the models your organisation already approves rather than at a fixed vendor."
      },
      {
        question: "Where does my data live?",
        answer:
          "On your own server. The database, object storage, and identity provider all run inside your network — nothing leaves it except the calls to whichever AI providers you configure."
      },
      {
        question: "Can it run on Kubernetes?",
        answer:
          "The reference deployment is Docker Compose. Nothing in the platform hardcodes Compose service names or local filesystem assumptions, so a Kubernetes migration stays open."
      },
      {
        question: "Is it production ready?",
        answer:
          "It is under active development and ships in numbered sprints. Read the architecture decision records to judge fit before you depend on it."
      }
    ] as const satisfies readonly FaqEntry[]
  }
};
