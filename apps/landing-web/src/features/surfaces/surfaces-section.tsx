import { Reveal } from "@/shared/reveal";
import { Section } from "@/shared/section";
import { SectionHeading } from "@/shared/section-heading";
import type { LocaleProps } from "@/shared/locale";
import { DEFAULT_LOCALE } from "@/shared/locale";
import { surfacesContent } from "./surfaces-content";

export function SurfacesSection({ locale = DEFAULT_LOCALE }: LocaleProps) {
  const copy = surfacesContent[locale];
  return (
    <Section id="surfaces" tone="surface">
      <SectionHeading eyebrow={copy.eyebrow} title={copy.title} description={copy.description} />
      <Reveal>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {copy.items.map((item) => (
            <article
              key={item.title}
              className="bg-page border-border-soft rounded-card shadow-card border p-7"
            >
              <h3 className="text-xl font-semibold tracking-tight">{item.title}</h3>
              <p className="text-primary mt-2 text-sm font-medium">{item.audience}</p>
              <p className="text-muted mt-4 leading-relaxed">{item.description}</p>
            </article>
          ))}
        </div>
      </Reveal>
    </Section>
  );
}
