export function HorizonLogo({ className }: { className?: string }) {
  return (
    <span
      className={["horizon-logo", "horizon-brand-lockup", className].filter(Boolean).join(" ")}
      role="img"
      aria-label="Horizon"
    >
      <img src="/horizon-mark.png" alt="" className="horizon-brand-mark" draggable={false} />
      <span className="horizon-brand-name">Horizon</span>
    </span>
  );
}
