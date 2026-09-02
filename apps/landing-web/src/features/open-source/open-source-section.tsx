import { ActionButton } from "@/shared/action-button";
import { Reveal } from "@/shared/reveal";
import { Section } from "@/shared/section";
import { SectionHeading } from "@/shared/section-heading";
import { openSourceContent } from "./open-source-content";

export function OpenSourceSection() {
  return (
    <Section id="open-source" tone="surface">
      <Reveal>
        <SectionHeading
          eyebrow={openSourceContent.eyebrow}
          title={openSourceContent.title}
          description={openSourceContent.description}
        />
        <div className="mt-10">
          <ActionButton action={openSourceContent.action} variant="secondary" />
        </div>
      </Reveal>
    </Section>
  );
}
