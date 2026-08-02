import { useEffect, useState } from "react";

export const EVCP_NAVIGATION_EVENT = "evcp:navigate";

export function navigateBrowserPath(path: string, options: { replace?: boolean } = {}) {
  if (typeof window === "undefined") return;
  const method = options.replace ? "replaceState" : "pushState";
  window.history[method]({}, "", path);
  window.dispatchEvent(new Event(EVCP_NAVIGATION_EVENT));
}

export function useBrowserPath(): string {
  const [pathname, setPathname] = useState(
    () => (typeof window === "undefined" ? "/" : window.location.pathname)
  );

  useEffect(() => {
    const sync = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", sync);
    window.addEventListener(EVCP_NAVIGATION_EVENT, sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener(EVCP_NAVIGATION_EVENT, sync);
    };
  }, []);

  return pathname;
}

export function usePageHeadingFocus(pathname: string): void {
  useEffect(() => {
    const heading = document.querySelector<HTMLElement>("main h1");
    if (!heading) return;
    heading.tabIndex = -1;
    heading.focus();
  }, [pathname]);
}
