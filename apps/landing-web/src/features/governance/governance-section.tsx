import { Reveal } from "@/shared/reveal";
import { Section } from "@/shared/section";
import { SectionHeading } from "@/shared/section-heading";
import type { LocaleProps } from "@/shared/locale";
import { governanceContent } from "./governance-content";

export function GovernanceSection(_props: LocaleProps) {
  return (
    <Section id="governance" tone="surface">
      <SectionHeading
        eyebrow={governanceContent.eyebrow}
        title={governanceContent.title}
        description={governanceContent.description}
      />
      <Reveal>
        <div className="mt-14 grid gap-x-10 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
          {governanceContent.items.map((item) => (
            <div key={item.title} className="border-border-soft border-t pt-6">
              <h3 className="font-semibold tracking-tight">{item.title}</h3>
              <p className="text-muted mt-3 leading-relaxed">{item.description}</p>
            </div>
          ))}
        </div>
      </Reveal>
    </Section>
  );
}
