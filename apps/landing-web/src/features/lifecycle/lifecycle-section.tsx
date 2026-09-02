import { Reveal } from "@/shared/reveal";
import { Section } from "@/shared/section";
import { SectionHeading } from "@/shared/section-heading";
import type { LocaleProps } from "@/shared/locale";
import { lifecycleContent } from "./lifecycle-content";

export function LifecycleSection(_props: LocaleProps) {
  return (
    <Section id="lifecycle">
      <SectionHeading
        eyebrow={lifecycleContent.eyebrow}
        title={lifecycleContent.title}
        description={lifecycleContent.description}
      />
      <Reveal>
        <ol className="mt-14 grid gap-6 md:grid-cols-5">
          {lifecycleContent.steps.map((step, index) => (
            <li key={step.title} className="bg-surface border-border-soft rounded-card border p-6">
              <span className="bg-primary-soft text-primary rounded-pill inline-flex h-8 w-8 items-center justify-center text-sm font-semibold">
                {index + 1}
              </span>
              <h3 className="mt-4 font-semibold tracking-tight">{step.title}</h3>
              <p className="text-muted mt-2 text-sm leading-relaxed">{step.description}</p>
            </li>
          ))}
        </ol>
      </Reveal>
    </Section>
  );
}
