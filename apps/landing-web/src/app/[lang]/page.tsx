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

// Typed explicitly rather than with Next's generated route-props helper for this path: that
// helper only resolves after `next build` writes .next/types/routes.d.ts, which doesn't exist
// on a fresh clone or in CI before the build step runs, so depending on it breaks `pnpm typecheck`.
export default async function LandingPage({
  params
}: {
  params: Promise<{ lang: string }>;
}) {
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
