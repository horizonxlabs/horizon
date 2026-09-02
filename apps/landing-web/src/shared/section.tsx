import type { ReactNode } from "react";

const toneClass = {
  page: "bg-page",
  surface: "bg-surface"
} as const;

export function Section({
  id,
  tone = "page",
  children
}: {
  id: string;
  tone?: keyof typeof toneClass;
  children: ReactNode;
}) {
  return (
    <section id={id} className={`${toneClass[tone]} scroll-mt-24 px-6 py-24 sm:py-32`}>
      <div className="mx-auto w-full max-w-6xl">{children}</div>
    </section>
  );
}
