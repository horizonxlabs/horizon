import type { ReactNode } from "react";

export function StoreStatePanel({
  tone = "neutral",
  eyebrow,
  title,
  children,
  action
}: {
  tone?: "neutral" | "danger";
  eyebrow: string;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section
      className={`store-state-panel store-state-panel-${tone}`}
      role={tone === "danger" ? "alert" : undefined}
    >
      <span className="eyebrow">{eyebrow}</span>
      <h2>{title}</h2>
      <div>{children}</div>
      {action}
    </section>
  );
}
