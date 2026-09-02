import { heroContent } from "@/features/hero";
import { ActionButton } from "@/shared/action-button";

export function FinalCtaSection() {
  return (
    <section id="start" className="evcp-hero-gradient px-6 py-28">
      <div className="mx-auto w-full max-w-3xl text-center">
        <h2 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Run it yourself this afternoon.
        </h2>
        <p className="text-muted mt-6 text-lg leading-relaxed text-pretty">
          Clone the repository, bring up the stack with one command, and build your first internal
          application end to end.
        </p>
        <div className="mt-10 flex flex-wrap justify-center gap-4">
          {heroContent.actions.map((action, index) => (
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
