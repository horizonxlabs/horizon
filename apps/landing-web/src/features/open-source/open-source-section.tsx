import { ActionButton } from "@/shared/action-button";
import { Reveal } from "@/shared/reveal";
import { Section } from "@/shared/section";
import { SectionHeading } from "@/shared/section-heading";
import type { LocaleProps } from "@/shared/locale";
import { openSourceContent } from "./open-source-content";

export function OpenSourceSection({ locale }: LocaleProps) {
  const copy = openSourceContent[locale];
  return (
    <Section id="open-source" tone="surface">
      <Reveal>
        <SectionHeading eyebrow={copy.eyebrow} title={copy.title} description={copy.description} />
        <div className="mt-10">
          <ActionButton action={copy.action} variant="secondary" />
        </div>
      </Reveal>
    </Section>
  );
}
