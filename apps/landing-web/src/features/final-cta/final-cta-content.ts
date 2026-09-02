import type { Locale } from "@/shared/locale";

type FinalCtaCopy = {
  headline: string;
  paragraph: string;
};

export const finalCtaContent: Record<Locale, FinalCtaCopy> = {
  th: {
    headline: "ลองรันเองได้ภายในบ่ายนี้",
    paragraph: "Clone repository เปิดใช้งานทั้งสแตกด้วยคำสั่งเดียว แล้วสร้างแอปภายในองค์กรแอปแรกของคุณตั้งแต่ต้นจนจบ"
  },
  en: {
    headline: "Run it yourself this afternoon.",
    paragraph:
      "Clone the repository, bring up the stack with one command, and build your first internal application end to end."
  }
};
