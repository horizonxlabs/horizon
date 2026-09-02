import { Reveal } from "@/shared/reveal";
import { Section } from "@/shared/section";
import { SectionHeading } from "@/shared/section-heading";
import type { LocaleProps } from "@/shared/locale";
import { governanceContent } from "./governance-content";

export function GovernanceSection({ locale }: LocaleProps) {
  const copy = governanceContent[locale];
  return (
    <Section id="governance" tone="surface">
      <SectionHeading eyebrow={copy.eyebrow} title={copy.title} description={copy.description} />
      <Reveal>
        <div className="mt-14 grid gap-x-10 gap-y-10 md:grid-cols-2 lg:grid-cols-3">
          {copy.items.map((item) => (
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
