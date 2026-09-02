import type { LinkAction } from "@/shared/content-types";

const variantClass = {
  primary: "bg-primary text-on-primary hover:bg-primary-strong shadow-card",
  secondary: "bg-surface text-body border-border hover:bg-surface-muted border"
} as const;

export function ActionButton({
  action,
  variant
}: {
  action: LinkAction;
  variant: keyof typeof variantClass;
}) {
  const external = action.external
    ? { target: "_blank" as const, rel: "noreferrer" as const }
    : {};
  return (
    <a
      href={action.href}
      {...external}
      className={`rounded-control inline-flex items-center justify-center px-6 py-3 text-base font-medium transition-colors ${variantClass[variant]}`}
    >
      {action.label}
    </a>
  );
}
