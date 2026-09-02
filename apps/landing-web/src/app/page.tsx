import { FaqSection } from "@/features/faq";
import { FinalCtaSection } from "@/features/final-cta";
import { GovernanceSection } from "@/features/governance";
import { HeroSection } from "@/features/hero";
import { LifecycleSection } from "@/features/lifecycle";
import { OpenSourceSection } from "@/features/open-source";
import { SelfHostSection } from "@/features/self-host";
import { SurfacesSection } from "@/features/surfaces";

export default function LandingPage() {
  return (
    <main>
      <HeroSection />
      <SurfacesSection />
      <LifecycleSection />
      <GovernanceSection />
      <SelfHostSection />
      <OpenSourceSection />
      <FaqSection />
      <FinalCtaSection />
    </main>
  );
}
