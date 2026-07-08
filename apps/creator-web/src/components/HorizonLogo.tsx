// Horizon brand mark: a rising sun over a horizon line. Rendered inside the sidebar's gradient
// tile (white strokes on the brand gradient), so it uses currentColor and no own background.
export function HorizonLogo({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {/* sun arc sitting on the horizon */}
      <path d="M6.5 15a5.5 5.5 0 0 1 11 0" />
      {/* rays */}
      <path d="M12 3.5v2M4.4 7.4l1.4 1.4M19.6 7.4l-1.4 1.4" />
      {/* horizon lines */}
      <path d="M3 15h4M17 15h4" />
      <path d="M5.5 18.5h13" />
    </svg>
  );
}
