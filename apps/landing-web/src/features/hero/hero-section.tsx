import { ActionButton } from "@/shared/action-button";
import { heroContent } from "./hero-content";
import { HeroProductVisual } from "./hero-product-visual";

export function HeroSection() {
  return (
    <section id="top" className="evcp-hero-gradient px-6 pt-24 pb-28 sm:pt-32 sm:pb-36">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-16 lg:grid-cols-2">
        <div>
          <p className="text-primary text-sm font-semibold tracking-widest uppercase">
            {heroContent.eyebrow}
          </p>
          <h1 className="mt-5 text-5xl leading-tight font-semibold tracking-tight text-balance sm:text-6xl">
            {heroContent.headline}
          </h1>
          <p className="text-muted mt-7 max-w-xl text-lg leading-relaxed text-pretty">
            {heroContent.subhead}
          </p>
          <div className="mt-10 flex flex-wrap gap-4">
            {heroContent.actions.map((action, index) => (
              <ActionButton
                key={action.href}
                action={action}
                variant={index === 0 ? "primary" : "secondary"}
              />
            ))}
          </div>
        </div>
        <HeroProductVisual />
      </div>
    </section>
  );
}
