// Installer preflight + setup DTOs. Grouped in a focused module and re-exported from the package
// entry so the client class stays lean.

export type InstallerPreflightInput = {
  cpuCores: number;
  memoryGb: number;
  diskFreeGb: number;
  os?: string;
  dockerVersion?: string;
  composeVersion?: string;
  portsAvailable?: number[];
  dnsReady?: boolean;
  tlsReady?: boolean;
  networkReady?: boolean;
};

export type InstallerCheckDto = {
  name: string;
  required: string;
  observed: string;
  status: "pass" | "fail";
  action: string;
};

export type InstallerReportDto = {
  id: string;
  status: "passed" | "failed";
  installBlocked: boolean;
  reportPath: string;
  checks: InstallerCheckDto[];
  actionableFailures: string[];
  composeServices?: Array<{ service: string; status: string; signal: string }>;
  createdAt?: string;
};

export type InstallerSetupInput = {
  domain: string;
  databaseUrl: string;
  storage: Record<string, string | number | boolean | undefined>;
  auth: Record<string, unknown>;
  ai: Record<string, unknown>;
  guardrail: Record<string, unknown>;
  backup: Record<string, unknown>;
  firstAdmin: Record<string, unknown>;
};

export type InstallerSetupResponse = {
  id: string;
  status: "completed";
  domain: string;
  databaseUrlMasked: string;
  storage: Record<string, unknown>;
  auth: Record<string, unknown>;
  ai: Record<string, unknown>;
  guardrail: Record<string, unknown>;
  backup: Record<string, unknown>;
  firstAdmin: Record<string, unknown>;
  createdAt?: string;
};
