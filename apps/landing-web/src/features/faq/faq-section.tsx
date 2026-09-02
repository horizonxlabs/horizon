import { Reveal } from "@/shared/reveal";
import { Section } from "@/shared/section";
import { SectionHeading } from "@/shared/section-heading";
import type { LocaleProps } from "@/shared/locale";
import { faqContent } from "./faq-content";

export function FaqSection({ locale }: LocaleProps) {
  const copy = faqContent[locale];
  return (
    <Section id="faq">
      <SectionHeading eyebrow={copy.eyebrow} title={copy.title} />
      <Reveal>
        <dl className="mt-12 grid gap-10 md:grid-cols-2">
          {copy.entries.map((entry) => (
            <div key={entry.question}>
              <dt className="font-semibold tracking-tight">{entry.question}</dt>
              <dd className="text-muted mt-3 leading-relaxed">{entry.answer}</dd>
            </div>
          ))}
        </dl>
      </Reveal>
    </Section>
  );
}
