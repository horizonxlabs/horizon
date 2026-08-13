import type { ReactNode } from "react";

export function StoreStatePanel({
  tone = "neutral",
  eyebrow,
  title,
  children,
  action,
  primary = false
}: {
  tone?: "neutral" | "danger";
  eyebrow: string;
  title: string;
  children: ReactNode;
  action?: ReactNode;
  primary?: boolean;
}) {
  const Heading = primary ? "h1" : "h2";
  return (
    <section
      className={`store-state-panel store-state-panel-${tone}`}
      role={tone === "danger" ? "alert" : undefined}
    >
      <span className="eyebrow">{eyebrow}</span>
      <Heading>{title}</Heading>
      <div>{children}</div>
      {action}
    </section>
  );
}
