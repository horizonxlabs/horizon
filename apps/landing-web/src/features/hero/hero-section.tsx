import { ActionButton } from "@/shared/action-button";
import { heroContent } from "./hero-content";
import { HeroProductVisual } from "./hero-product-visual";

export function HeroSection() {
  return (
    <section id="top" className="evcp-hero-gradient px-6 pt-16 pb-20 sm:pt-24 sm:pb-28">
      <div className="mx-auto grid w-full max-w-6xl items-center gap-12 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <p className="text-primary text-sm font-semibold tracking-widest uppercase">
            {heroContent.eyebrow}
          </p>
          <h1 className="mt-5 text-5xl leading-tight font-semibold tracking-tight text-balance sm:text-6xl">
            {heroContent.headline}
          </h1>
          <p className="text-muted mt-6 max-w-xl text-lg leading-relaxed text-pretty">
            {heroContent.subhead}
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            {heroContent.actions.map((action, index) => (
              <ActionButton
                key={action.href}
                action={action}
                variant={index === 0 ? "primary" : "secondary"}
              />
            ))}
          </div>
        </div>
        <div className="lg:col-span-2">
          <HeroProductVisual />
        </div>
      </div>
    </section>
  );
}
