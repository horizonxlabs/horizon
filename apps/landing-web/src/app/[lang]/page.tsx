import { notFound } from "next/navigation";
import { FaqSection } from "@/features/faq";
import { FinalCtaSection } from "@/features/final-cta";
import { GovernanceSection } from "@/features/governance";
import { HeroSection } from "@/features/hero";
import { LifecycleSection } from "@/features/lifecycle";
import { OpenSourceSection } from "@/features/open-source";
import { SelfHostSection } from "@/features/self-host";
import { SurfacesSection } from "@/features/surfaces";
import { isLocale } from "@/shared/locale";

export default async function LandingPage({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return (
    <main>
      <HeroSection locale={lang} />
      <SurfacesSection locale={lang} />
      <LifecycleSection locale={lang} />
      <GovernanceSection locale={lang} />
      <SelfHostSection locale={lang} />
      <OpenSourceSection locale={lang} />
      <FaqSection locale={lang} />
      <FinalCtaSection locale={lang} />
    </main>
  );
}
