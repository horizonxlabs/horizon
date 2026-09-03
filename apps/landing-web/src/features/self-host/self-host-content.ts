import type { Locale } from "@/shared/locale";

type SelfHostCopy = {
  eyebrow: string;
  title: string;
  description: string;
  command: string;
  commandCaption: string;
  services: readonly string[];
};

const services = [
  "Postgres",
  "Redis",
  "MinIO",
  "Keycloak",
  "LiteLLM",
  "OpenBao",
  "Platform API",
  "Admin Console",
  "Creator App",
  "App Store PWA",
  "Caddy"
] as const;

export const selfHostContent: Record<Locale, SelfHostCopy> = {
  th: {
    eyebrow: "ติดตั้งเอง (Self-host)",
    title: "รันบนเซิร์ฟเวอร์ของคุณเอง ไม่ใช่ของเรา",
    description:
      "ไฟล์ Compose เพียงไฟล์เดียวเปิดใช้งานทั้งแพลตฟอร์ม ไม่มีบริการแบบ hosted ให้ต้องสมัครสมาชิก และไม่มีข้อมูลใดออกจากเครือข่ายของคุณ ยกเว้นการเรียกใช้งานไปยังผู้ให้บริการ AI ที่คุณเลือกตั้งค่าเอง",
    command: "pnpm dev:setup",
    commandCaption: "เปิดใช้งานทั้งสแตก ทำการ migrate ฐานข้อมูล และใส่ข้อมูลตั้งต้นให้พร้อมใช้งาน",
    services
  },
  en: {
    eyebrow: "Self-host",
    title: "It runs on your server, not ours.",
    description:
      "One Compose file brings up the whole platform. There is no hosted tier to sign up for, and nothing leaves your network except the calls to whichever AI providers you configure.",
    command: "pnpm dev:setup",
    commandCaption: "Brings up the full stack, applies migrations, and seeds the database.",
    services
  }
};
