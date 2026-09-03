import { heroContent } from "@/features/hero";
import { ActionButton } from "@/shared/action-button";
import type { LocaleProps } from "@/shared/locale";
import { finalCtaContent } from "./final-cta-content";

export function FinalCtaSection({ locale }: LocaleProps) {
  const copy = finalCtaContent[locale];
  return (
    <section className="evcp-hero-gradient px-6 py-28">
      <div className="mx-auto w-full max-w-3xl text-center">
        <h2 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          {copy.headline}
        </h2>
        <p className="text-muted mt-6 text-lg leading-relaxed text-pretty">{copy.paragraph}</p>
        <div className="mt-10 flex flex-wrap justify-center gap-4">
          {heroContent[locale].actions.map((action, index) => (
            <ActionButton
              key={action.href}
              action={action}
              variant={index === 0 ? "primary" : "secondary"}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
