// Extracted from app-factory.ts (composition root) to keep that file under its size ratchet;
// app-factory.ts re-exports this so existing importers (`from "../app-factory"` /
// `from "./app-factory"`) keep working unchanged.
export function renderPreviewUnavailableHtml(input: { status: number; title?: string; message?: string }): string {
  // A 401 means the path-scoped preview cookie expired — reloading this frame alone can never
  // recover. Signal the parent page (same origin) so it renews the session; the meta refresh
  // below then succeeds with the renewed cookie.
  const unauthorized = input.status === 401;
  const title = input.title ?? (unauthorized ? "Renewing preview authorization" : "Starting workspace preview");
  const message =
    input.message ??
    (unauthorized
      ? "The preview authorization expired and is being renewed. This preview will refresh automatically."
      : "The workspace container is still starting. This preview will refresh automatically.");
  const parentSignal = unauthorized
    ? `<script>try { window.parent.postMessage({ type: "evcp:preview-unauthorized" }, window.location.origin); } catch {}</script>`
    : "";
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="refresh" content="3" />
    <title>${title}</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      body {
        align-items: center;
        background:
          radial-gradient(720px 420px at 50% 0%, rgba(37, 99, 235, 0.12), transparent 64%),
          #f8fafc;
        color: #0f172a;
        display: flex;
        justify-content: center;
        margin: 0;
        min-height: 100vh;
      }
      main {
        align-items: center;
        background: rgba(255, 255, 255, 0.86);
        border: 1px solid #e2e8f0;
        border-radius: 18px;
        box-shadow: 0 22px 70px rgba(15, 23, 42, 0.12);
        display: flex;
        flex-direction: column;
        gap: 14px;
        max-width: 420px;
        padding: 32px;
        text-align: center;
      }
      .spinner {
        border: 3px solid #dbeafe;
        border-top-color: #2563eb;
        border-radius: 999px;
        height: 34px;
        width: 34px;
        animation: spin 0.9s linear infinite;
      }
      h1 {
        font-size: 20px;
        line-height: 1.25;
        margin: 0;
      }
      p {
        color: #64748b;
        font-size: 14px;
        line-height: 1.5;
        margin: 0;
      }
      small {
        color: #94a3b8;
        font-size: 12px;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    </style>
  </head>
  <body>
    <main role="status" aria-live="polite">
      <div class="spinner" aria-hidden="true"></div>
      <h1>${title}</h1>
      <p>${message}</p>
      <small>Status ${input.status}. Retrying in a moment.</small>
    </main>
    ${parentSignal}
  </body>
</html>`;
}
