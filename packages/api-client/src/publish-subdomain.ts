export const RESERVED_SUBDOMAINS = new Set([
  "admin",
  "api",
  "auth",
  "creator",
  "store",
  "storage",
  "www"
]);

export type SubdomainValidation =
  { ok: true; value: string } | { ok: false; code: "SUBDOMAIN_INVALID"; message: string };

export type AppStoreVisibility = "public" | "restricted";

export type AppStorePublishInput = {
  subdomain: string;
  visibility?: AppStoreVisibility;
};

export type PublishAccessUrlConfigDto = {
  baseDomain: string;
  secure: boolean;
  port?: number;
};

type SubdomainUrlConfig = Omit<PublishAccessUrlConfigDto, "secure"> & {
  secure?: boolean;
};

const LABEL = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){1,61}[a-z0-9]$/;

function trimLabel(value: string): string {
  return value.slice(0, 63).replace(/-+$/, "");
}

function normalizeAscii(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeSubdomainSuggestion(projectName: string, resourceKey: string): string {
  return trimLabel(normalizeAscii(projectName)) || trimLabel(normalizeAscii(resourceKey));
}

export function validateSubdomainLabel(label: string): SubdomainValidation {
  if (!LABEL.test(label)) {
    return {
      ok: false,
      code: "SUBDOMAIN_INVALID",
      message: "Subdomain must be 3-63 lowercase letters, numbers, or single hyphens."
    };
  }

  if (RESERVED_SUBDOMAINS.has(label)) {
    return {
      ok: false,
      code: "SUBDOMAIN_INVALID",
      message: "This subdomain is reserved."
    };
  }

  return { ok: true, value: label };
}

export function subdomainFromHostname(hostname: string, baseDomain: string): string | null {
  const normalizedHostname = hostname.toLowerCase().replace(/:\d+$/, "");
  const normalizedBaseDomain = baseDomain.toLowerCase().replace(/:\d+$/, "");
  const suffix = `.${normalizedBaseDomain}`;

  if (!normalizedHostname.endsWith(suffix)) return null;

  const label = normalizedHostname.slice(0, -suffix.length);
  return label && !label.includes(".") ? label : null;
}

export function buildSubdomainUrl(subdomain: string, config: SubdomainUrlConfig): string {
  const scheme = config.secure ? "https" : "http";
  const port = typeof config.port === "number" ? `:${config.port}` : "";
  return `${scheme}://${subdomain}.${config.baseDomain.toLowerCase()}${port}`;
}
