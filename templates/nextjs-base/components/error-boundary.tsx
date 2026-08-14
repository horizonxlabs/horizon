"use client";

import { Component, type ReactNode } from "react";

// Root error boundary: a client-side crash renders a calm fallback instead of a white
// page, and the error is relayed to the platform (same channel as dev-error-relay) so
// the auto-debug loop can pick it up.
export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; message: string }
> {
  state = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error) {
    try {
      if (typeof window !== "undefined" && window.parent !== window) {
        window.parent.postMessage(
          { type: "evcp:preview-error", source: "boundary", message: error.message.slice(0, 1000) },
          window.location.origin
        );
      }
    } catch {
      // never rethrow from reporting
    }
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-slate-50 p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-2xl">
          ⚠️
        </div>
        <h1 className="text-lg font-semibold text-slate-900">หน้านี้พบข้อผิดพลาด</h1>
        <p className="max-w-md text-sm text-slate-500">
          ระบบส่งรายละเอียดให้ AI แล้ว — ลองรีเฟรช หรือสั่งแก้ในแชทได้เลย
        </p>
        <p className="max-w-md font-mono text-xs text-slate-400">{this.state.message.slice(0, 200)}</p>
      </div>
    );
  }
}
