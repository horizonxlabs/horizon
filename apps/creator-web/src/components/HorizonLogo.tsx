type HorizonLogoVariant = "mark" | "wordmark" | "auth";

// The creator app is served at /creator/. Keep this as a plain browser-safe constant:
// render-smoke imports components directly in Node, where Vite's import.meta.env is absent.
const horizonLogoSrc = "/creator/horizon-logo.png";

export function HorizonLogo({
  variant = "mark",
  alt = "Horizon",
  className
}: {
  variant?: HorizonLogoVariant;
  alt?: string;
  className?: string;
}) {
  return (
    <img
      src={horizonLogoSrc}
      alt={alt}
      className={["horizon-logo", `horizon-logo-${variant}`, className].filter(Boolean).join(" ")}
      draggable={false}
    />
  );
}
