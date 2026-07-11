type HorizonLogoVariant = "mark" | "wordmark" | "auth";

const horizonLogoSrc = `${import.meta.env.BASE_URL}horizon-logo.png`;

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
