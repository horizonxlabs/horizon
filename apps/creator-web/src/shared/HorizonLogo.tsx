type HorizonLogoVariant = "mark" | "wordmark" | "auth";

// The creator app is served at /creator/. Keep these as plain browser-safe constants:
// render-smoke imports components directly in Node, where Vite's import.meta.env is absent.
const horizonWordmarkSrc = "/creator/horizon-logo.png";
const horizonMarkSrc = "/creator/horizon-mark.png";

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
        <img
          src={horizonWordmarkSrc}
          alt={alt}
          className={["horizon-logo", "horizon-logo-full", className].filter(Boolean).join(" ")}
          draggable={false}
        />
        <img
          src={horizonMarkSrc}
          alt=""
          aria-hidden="true"
          className={["horizon-logo", "horizon-logo-icon", className].filter(Boolean).join(" ")}
          draggable={false}
        />
      </>
    );
  }

  return (
    <img
      src={horizonWordmarkSrc}
      alt={alt}
      className={["horizon-logo", `horizon-logo-${variant}`, className].filter(Boolean).join(" ")}
      draggable={false}
    />
  );
}
