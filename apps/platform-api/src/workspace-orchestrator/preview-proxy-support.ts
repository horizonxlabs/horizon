import type { HeaderBag } from "../platform-http-types";

export function previewRequestHeaders(headers: HeaderBag): HeaderBag | null {
  const token = String(headers.cookie ?? "").match(/(?:^|;\s*)evcp_preview_token=([^;]+)/)?.[1];
  if (!token) return headers;
  try {
    return { ...headers, authorization: `Bearer ${decodeURIComponent(token)}` };
  } catch {
    return null;
  }
}

export function rewritePreviewForwardPath(
  originalUrl: string,
  requestKey: string,
  previewBase: string | undefined
): string {
  const requestBase = `/preview/${encodeURIComponent(requestKey)}`;
  if (!previewBase || previewBase === requestBase || !originalUrl.startsWith(requestBase)) {
    return originalUrl;
  }
  return `${previewBase}${originalUrl.slice(requestBase.length)}`;
}
