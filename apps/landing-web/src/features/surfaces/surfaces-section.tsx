import { Reveal } from "@/shared/reveal";
import { Section } from "@/shared/section";
import { SectionHeading } from "@/shared/section-heading";
import type { LocaleProps } from "@/shared/locale";
import { surfacesContent } from "./surfaces-content";

export function SurfacesSection(_props: LocaleProps) {
  return (
    <Section id="surfaces" tone="surface">
      <SectionHeading
        eyebrow={surfacesContent.eyebrow}
        title={surfacesContent.title}
        description={surfacesContent.description}
      />
      <Reveal>
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {surfacesContent.items.map((item) => (
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
