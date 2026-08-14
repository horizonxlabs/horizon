"use client";

import { useEffect } from "react";

// Preview error relay: inside the platform's preview iframe, browser-side failures
// (uncaught errors, unhandled rejections, console.error) are reported to the parent
// workspace so the platform can auto-debug them. Outside an iframe (published app,
// direct open) this component does nothing. Debounced per error signature.

const REPORTED = new Map<string, number>();
const REPORT_INTERVAL_MS = 60_000;

function report(source: string, message: string) {
  try {
    if (typeof window === "undefined" || window.parent === window) return;
    const signature = `${source}:${message.slice(0, 160)}`;
    const last = REPORTED.get(signature) ?? 0;
    if (Date.now() - last < REPORT_INTERVAL_MS) return;
    REPORTED.set(signature, Date.now());
    window.parent.postMessage(
      { type: "evcp:preview-error", source, message: message.slice(0, 1000) },
      window.location.origin
    );
  } catch {
    // reporting must never break the app
  }
}

export function DevErrorRelay() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => {
      report("window", `${event.message}${event.filename ? ` (${event.filename}:${event.lineno})` : ""}`);
    };
    const onRejection = (event: PromiseRejectionEvent) => {
      report("promise", String(event.reason?.message ?? event.reason ?? "Unhandled rejection"));
    };
    const originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      report("console", args.map((value) => (typeof value === "string" ? value : String(value))).join(" "));
      originalConsoleError(...args);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      console.error = originalConsoleError;
    };
  }, []);
  return null;
}
