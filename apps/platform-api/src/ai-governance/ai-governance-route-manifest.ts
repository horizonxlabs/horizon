import type { PlatformRequest } from "../app-factory";

// The AI-governance + guardrail HTTP routes registered against the async dispatcher.
// Extracted from app-factory.ts (composition root) to keep that file under its size ratchet;
// `PlatformRequest["path"]` is imported type-only so there is no runtime import cycle.
export const aiGovernanceHttpRoutes: Array<{ method: "GET" | "POST"; path: PlatformRequest["path"] }> = [
  { method: "GET", path: "/ai/providers" },
  { method: "POST", path: "/ai/providers" },
  { method: "POST", path: "/ai/providers/status" },
  { method: "POST", path: "/ai/providers/update" },
  { method: "POST", path: "/ai/providers/delete" },
  { method: "GET", path: "/ai/api-keys" },
  { method: "POST", path: "/ai/api-keys" },
  { method: "POST", path: "/ai/api-keys/status" },
  { method: "POST", path: "/ai/api-keys/delete" },
  { method: "GET", path: "/ai/routes" },
  { method: "GET", path: "/ai/quotas" },
  { method: "POST", path: "/ai/routes" },
  { method: "POST", path: "/ai/quotas" },
  { method: "POST", path: "/ai/provider-test-call" },
  { method: "POST", path: "/ai/provider-catalog" },
  { method: "POST", path: "/guardrails/rules" },
  { method: "POST", path: "/guardrails/test" },
  { method: "GET", path: "/guardrails/events" }
];
