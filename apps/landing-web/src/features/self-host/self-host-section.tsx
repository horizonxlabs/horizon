import { Reveal } from "@/shared/reveal";
import { Section } from "@/shared/section";
import { SectionHeading } from "@/shared/section-heading";
import type { LocaleProps } from "@/shared/locale";
import { DEFAULT_LOCALE } from "@/shared/locale";
import { selfHostContent } from "./self-host-content";

export function SelfHostSection({ locale = DEFAULT_LOCALE }: LocaleProps) {
  const copy = selfHostContent[locale];
  return (
    <Section id="self-host">
      <SectionHeading eyebrow={copy.eyebrow} title={copy.title} description={copy.description} />
      <Reveal>
        <div className="mt-12 grid items-start gap-10 lg:grid-cols-2">
          <div>
            <pre className="evcp-code-block rounded-card overflow-x-auto px-6 py-5 text-sm">
              <code>$ {copy.command}</code>
            </pre>
            <p className="text-muted mt-4 text-sm">{copy.commandCaption}</p>
          </div>
          <ul className="flex flex-wrap gap-3">
            {copy.services.map((service) => (
              <li
                key={service}
                className="bg-surface border-border rounded-pill text-muted border px-4 py-2 text-sm"
              >
                {service}
              </li>
            ))}
          </ul>
        </div>
      </Reveal>
    </Section>
  );
}
