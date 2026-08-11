type HorizonLogoVariant = "mark" | "wordmark" | "auth";

// The creator app is served at /creator/. Keep these as plain browser-safe constants:
// render-smoke imports components directly in Node, where Vite's import.meta.env is absent.
const horizonMarkSrc = "/creator/horizon-mark.png";

function BrandLockup({
  alt,
  className,
  iconOnly = false
}: {
  alt: string;
  className: string;
  iconOnly?: boolean;
}) {
  return (
    <span
      className={className}
      role="img"
      aria-label={iconOnly ? undefined : alt}
      aria-hidden={iconOnly ? "true" : undefined}
    >
      <img src={horizonMarkSrc} alt="" className="horizon-brand-mark" draggable={false} />
      {iconOnly ? null : <span className="horizon-brand-name">Horizon</span>}
    </span>
  );
}

export function HorizonLogo({
  variant = "mark",
  alt = "Horizon",
  className
}: {
  variant?: HorizonLogoVariant;
  alt?: string;
  className?: string;
}) {
  // The sidebar mark variant shows the full wordmark when expanded and swaps to the
  // icon-only mark when the shell collapses (visibility toggled by CSS on .app-shell-collapsed).
  if (variant === "mark") {
    return (
      <>
        <BrandLockup
          alt={alt}
          className={["horizon-logo", "horizon-brand-lockup", "horizon-logo-full", className]
            .filter(Boolean)
            .join(" ")}
        />
        <BrandLockup
          alt={alt}
          iconOnly
          className={["horizon-logo", "horizon-logo-icon", className].filter(Boolean).join(" ")}
        />
      </>
    );
  }

  return (
    <BrandLockup
      alt={alt}
      className={["horizon-logo", "horizon-brand-lockup", `horizon-logo-${variant}`, className]
        .filter(Boolean)
        .join(" ")}
    />
  );
}
