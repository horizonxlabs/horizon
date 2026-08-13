// Preview-session renewal contract shared by the keepalive hook and its tests.
// The server scopes the preview cookie to Max-Age=900 (15 minutes); the parent page must
// renew it before expiry, and the 401 fallback page posts this message when renewal is late.
export const PREVIEW_UNAUTHORIZED_MESSAGE_TYPE = "evcp:preview-unauthorized";

// Renew at 10 minutes — comfortably inside the 15-minute cookie lifetime.
export const PREVIEW_REAUTHORIZE_INTERVAL_MS = 10 * 60 * 1000;

export function isPreviewUnauthorizedMessage(data: unknown): boolean {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: unknown }).type === PREVIEW_UNAUTHORIZED_MESSAGE_TYPE
  );
}
