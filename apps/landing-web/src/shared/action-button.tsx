import type { LinkAction } from "@/shared/content-types";

const buttonBase =
  "rounded-control inline-flex items-center justify-center px-6 py-3 text-base font-medium transition-colors";

const variantClass = {
  primary: `${buttonBase} bg-primary text-on-primary hover:bg-primary-strong shadow-card`,
  secondary: `${buttonBase} bg-surface text-body border-border hover:bg-surface-muted border`,
  // A plain inline text link, styled for surfaces (like the footer) that need the same
  // external-link safety (`target`/`rel`) as the button variants without button chrome.
  link: "text-primary text-sm font-medium transition-colors hover:underline"
} as const;

export function ActionButton({
  action,
  variant
}: {
  action: LinkAction;
  variant: keyof typeof variantClass;
}) {
  const external = action.external ? { target: "_blank" as const, rel: "noreferrer" as const } : {};
  return (
    <a href={action.href} {...external} className={variantClass[variant]}>
      {action.label}
    </a>
  );
}
