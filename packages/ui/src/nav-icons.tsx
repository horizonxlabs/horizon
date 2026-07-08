import type { ReactNode } from "react";

// Dependency-free inline glyph set for the shared AppShell sidebar. Each entry is the inner
// geometry of a 24x24 stroke icon (currentColor, so it inherits the nav item's text color).
// Kept in-package instead of pulling lucide-react into @evcp/ui, which only depends on react.
//
// Each glyph is a render function (not a bare element) so its JSX is only evaluated when NavGlyph
// renders — never at module import. That keeps `@evcp/ui` importable by tests that pull in pure
// helpers without setting up a React global (the tsx loader compiles JSX to classic
// React.createElement, which would otherwise throw at import time).
const GLYPHS: Record<string, () => ReactNode> = {
  dashboard: () => (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  projects: () => (
    <>
      <path d="M12 3 3 7.5l9 4.5 9-4.5L12 3Z" />
      <path d="M3 12l9 4.5 9-4.5" />
      <path d="M3 16.5 12 21l9-4.5" />
    </>
  ),
  prd: () => (
    <>
      <path d="M6 3h8l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M14 3v4h4" />
      <path d="M8.5 12.5h7M8.5 16h7M8.5 9h3" />
    </>
  ),
  workspace: () => (
    <>
      <path d="m5 3 1 2.5L8.5 6.5 6 7.5 5 10 4 7.5 1.5 6.5 4 5.5 5 3Z" />
      <path d="M15 8.5 16.5 12l3.5 1.5-3.5 1.5L15 18.5 13.5 15 10 13.5 13.5 12 15 8.5Z" />
    </>
  ),
  users: () => (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 6.1" />
      <path d="M17.5 20a5.5 5.5 0 0 0-3-4.9" />
    </>
  ),
  publish: () => (
    <>
      <path d="M12 3c3.5 1.5 5.5 4.5 5.5 8.5 0 2-.6 3.6-1.5 5H8c-.9-1.4-1.5-3-1.5-5C6.5 7.5 8.5 4.5 12 3Z" />
      <circle cx="12" cy="10" r="1.8" />
      <path d="M8 16.5 6.5 21l3-1.2M16 16.5 17.5 21l-3-1.2" />
    </>
  ),
  tickets: () => (
    <>
      <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2 2 2 0 0 0 0 4 2 2 0 0 1-2 2v0a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2 2 2 0 0 1-2-2 2 2 0 0 0 0-4Z" />
      <path d="M13 7v10" />
    </>
  ),
  services: () => (
    <>
      <rect x="3" y="4" width="18" height="6" rx="2" />
      <rect x="3" y="14" width="18" height="6" rx="2" />
      <path d="M7 7h.01M7 17h.01" />
    </>
  ),
  ai: () => (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2.5" />
      <path d="M9.5 9.5h5v5h-5z" />
      <path d="M9 3v2M15 3v2M9 19v2M15 19v2M3 9h2M3 15h2M19 9h2M19 15h2" />
    </>
  ),
  shield: () => (
    <>
      <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  logs: () => (
    <>
      <path d="M8 5h12M8 12h12M8 19h12" />
      <path d="M4 5h.01M4 12h.01M4 19h.01" />
    </>
  ),
  apps: () => (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  grid: () => (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2.5" />
      <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
    </>
  ),
  profile: () => (
    <>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    </>
  )
};

const FALLBACK = () => <circle cx="12" cy="12" r="3" />;

export function NavGlyph({ name }: { name?: string }) {
  const glyph = (name && GLYPHS[name]) || FALLBACK;
  return (
    <svg
      className="sidebar-nav-glyph"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {glyph()}
    </svg>
  );
}
