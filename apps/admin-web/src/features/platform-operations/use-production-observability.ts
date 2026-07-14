import type { PlatformApiClient } from "@evcp/api-client";
import { useEffect, useState } from "react";

export type ProductionServiceHealth = { name: string; status: "healthy" | "degraded" | "failed"; detail: string };
export type ProductionQueueHealth = { name: string; depth: number; failedCount: number; oldestJobAgeSeconds: number; status: "healthy" | "degraded" | "failed" };
export type ProductionAuditEvent = { id: string; action: string; actorId: string; severity: string; occurredAt: string };
type ObservabilityDashboard = { serviceHealth: ProductionServiceHealth[]; queueHealth: ProductionQueueHealth[]; recentAuditEvents: ProductionAuditEvent[] };

const emptyDashboard: ObservabilityDashboard = { serviceHealth: [], queueHealth: [], recentAuditEvents: [] };

export function useProductionObservability(client: PlatformApiClient | undefined) {
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");
  const [dashboard, setDashboard] = useState(emptyDashboard);
  const [message, setMessage] = useState("Loading production operations from Platform API.");

  useEffect(() => {
    let active = true;
    if (!client) {
      setStatus("unavailable");
      setDashboard(emptyDashboard);
      setMessage("A valid Admin session is required to view production operations.");
      return () => { active = false; };
    }
    setStatus("loading");
    setDashboard(emptyDashboard);
    void client.request<ObservabilityDashboard>("/admin/production/observability")
      .then((result) => {
        if (!active) return;
        setDashboard(result);
        setStatus("ready");
        setMessage("Production operations loaded from Platform API.");
      })
      .catch(() => {
        if (!active) return;
        setDashboard(emptyDashboard);
        setStatus("unavailable");
        setMessage("Production operations are unavailable. No local health evidence is shown.");
      });
    return () => { active = false; };
  }, [client]);

  return { status, message, ...dashboard };
}
