import type { EnvironmentName } from "@evcp/types";

export type PublishHeaderBag = Record<string, string | string[] | undefined>;

export function normalizePublishEnvironment(value: unknown): EnvironmentName {
  return value === "staging" || value === "dev" || value === "production" ? value : "production";
}

export function deploymentProxyPath(originalUrl: string): string {
  return originalUrl || "/";
}

export function appSessionHeaders(headers: PublishHeaderBag): PublishHeaderBag {
  const encodedToken = String(headers.cookie ?? "").match(/(?:^|;\s*)evcp_app_token=([^;]+)/)?.[1];
  if (!encodedToken) return headers;
  try {
    return { ...headers, authorization: `Bearer ${decodeURIComponent(encodedToken)}` };
  } catch {
    return headers;
  }
}
