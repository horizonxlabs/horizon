export function HorizonLogo({ className }: { className?: string }) {
  const fullClassName = [
    "horizon-logo",
    "horizon-brand-lockup",
    "horizon-logo-full",
    className
  ]
    .filter(Boolean)
    .join(" ");
  const iconClassName = ["horizon-logo", "horizon-logo-icon", className]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <span className={fullClassName} role="img" aria-label="Horizon">
        <img src="/horizon-mark.png" alt="" className="horizon-brand-mark" draggable={false} />
        <span className="horizon-brand-name">Horizon</span>
      </span>
      <span className={iconClassName} role="img" aria-hidden="true">
        <img src="/horizon-mark.png" alt="" className="horizon-brand-mark" draggable={false} />
      </span>
    </>
  );
}
