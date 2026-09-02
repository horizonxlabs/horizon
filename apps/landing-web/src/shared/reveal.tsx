import type { ReactNode } from "react";

/** Wraps a section so it fades in as it scrolls into view. The animation lives entirely in
 *  CSS (see .evcp-reveal in @evcp/ui/marketing.css), so this stays a server component and
 *  the content is visible even when the animation is unsupported or unwanted. */
export function Reveal({ children }: { children: ReactNode }) {
  return <div className="evcp-reveal">{children}</div>;
}
