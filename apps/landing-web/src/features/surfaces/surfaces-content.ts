import type { Locale } from "@/shared/locale";

export type SurfaceItem = { title: string; audience: string; description: string };

type SurfacesCopy = {
  eyebrow: string;
  title: string;
  description: string;
  items: readonly SurfaceItem[];
};

export const surfacesContent: Record<Locale, SurfacesCopy> = {
  th: {
    eyebrow: "แพลตฟอร์ม",
    title: "สามแอปพลิเคชัน บน Platform API เดียวกัน",
    description:
      "ผู้ดูแลระบบ ผู้สร้างแอป และพนักงานทั่วไป แต่ละกลุ่มได้แอปพลิเคชันที่ออกแบบมาเฉพาะ บน Platform API เดียวกัน",
    items: [
      {
        title: "Admin Console",
        audience: "ทีม IT ความปลอดภัย และผู้ดูแลแพลตฟอร์ม",
        description:
          "ควบคุมผู้ให้บริการ AI สิทธิ์การเข้าถึง นโยบาย การดำเนินงาน และใบอนุญาต เพื่อความพร้อมก่อนเผยแพร่"
      },
      {
        title: "Creator App",
        audience: "ทีมสร้างธุรกิจและทีมพัฒนา",
        description:
          "เปลี่ยนความต้องการให้เป็น PRD เวิร์กสเปซที่ AI สร้างขึ้น ตัวอย่างใช้งานจริง และแอปพลิเคชันที่เผยแพร่แล้ว"
      },
      {
        title: "App Store PWA",
        audience: "พนักงานและผู้ใช้ที่ได้รับอนุมัติ",
        description:
          "ค้นหาแอปภายในองค์กร ขอสิทธิ์การเข้าถึง และส่งความคิดเห็นด้านการสนับสนุนหรือผลิตภัณฑ์"
      }
    ] as const satisfies readonly SurfaceItem[]
  },
  en: {
    eyebrow: "Platform",
    title: "Three surfaces, one Platform API.",
    description:
      "Administrators, builders, and employees each get a purpose-built application over the same Platform API.",
    items: [
      {
        title: "Admin Console",
        audience: "IT, security, and platform administrators",
        description:
          "Govern providers, access, policies, operations, and licenses for release readiness."
      },
      {
        title: "Creator App",
        audience: "Business builders and development teams",
        description:
          "Turn a requirement into a PRD, an AI-built workspace, a preview, and a published application."
      },
      {
        title: "App Store PWA",
        audience: "Employees and approved end users",
        description:
          "Discover internal apps, request access, and submit support or product feedback."
      }
    ] as const satisfies readonly SurfaceItem[]
  }
};
