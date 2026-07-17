import type { PlatformApiClient } from "@evcp/api-client";
import { Badge, DecisionPanel, MetricCard, PageHeader, SectionCard, Table, Tabs, TCell, THead, TRow } from "@evcp/ui";
import { useState } from "react";
import { KnowledgePanel } from "./KnowledgePanel";
import { SkillsPanel } from "./SkillsPanel";
import { useKnowledgeSkills } from "./use-knowledge-skills";

type PanelId = "knowledge" | "skills" | "retrieval";

const TABS = [
  { id: "knowledge", label: "Knowledge" },
  { id: "skills", label: "Skills" },
  { id: "retrieval", label: "Retrieval logs" }
] as const;

export function KnowledgeSkillsConsole({ client }: { client: PlatformApiClient }) {
  const controller = useKnowledgeSkills(client);
  const [tab, setTab] = useState<PanelId>("knowledge");

  const indexedSources = controller.sources.filter((source) => source.indexStatus === "indexed").length;
  const activeSkills = controller.skills.filter((skill) => skill.status === "active").length;

  return (
    <section className="flex flex-col gap-6">
      <PageHeader
        eyebrow="AI Governance"
        title="Knowledge & Skills"
        description="Curate the enterprise knowledge and agent skills that ground every generation under permission-scoped governance."
      />

      {controller.availability === "error" ? (
        <DecisionPanel
          tone="danger"
          badge="error"
          title={controller.message}
          lines={["Retrieval and governance data loads from Platform API — no demo fallback."]}
        />
      ) : null}
      {controller.error ? (
        <DecisionPanel tone="warning" badge="action failed" title={controller.error} lines={["Review the input and try again."]} />
      ) : null}

      <section className="ds-metric-grid">
        <MetricCard label="Knowledge sources" value={String(controller.sources.length)} detail={`${indexedSources} indexed`} tone="success" />
        <MetricCard label="Active skills" value={String(activeSkills)} detail={`${controller.skills.length} total`} tone="info" />
        <MetricCard label="Retrieval events" value={String(controller.retrievalLogs.length)} detail="permission-filtered" tone="neutral" />
        <MetricCard
          label="Data source"
          value={controller.availability === "ready" ? "Live" : controller.availability}
          detail={controller.message}
          tone={controller.availability === "ready" ? "success" : "warning"}
        />
      </section>

      <Tabs items={TABS} active={tab} onSelect={setTab} aria-label="Knowledge and skills sections" />

      {tab === "knowledge" ? <KnowledgePanel controller={controller} /> : null}
      {tab === "skills" ? <SkillsPanel controller={controller} /> : null}
      {tab === "retrieval" ? (
        <SectionCard eyebrow="Evidence" title="Knowledge retrieval logs">
          <Table>
            <THead>
              <TRow>
                <TCell>When</TCell>
                <TCell>Role</TCell>
                <TCell>Scenario</TCell>
                <TCell>Matched</TCell>
                <TCell>Denied</TCell>
              </TRow>
            </THead>
            <tbody>
              {controller.retrievalLogs.map((log) => (
                <TRow key={log.id}>
                  <TCell>{new Date(log.createdAt).toLocaleString()}</TCell>
                  <TCell>{log.agentRole}</TCell>
                  <TCell>{log.scenario}</TCell>
                  <TCell>
                    <Badge tone={log.matchedVersionIds.length > 0 ? "success" : "neutral"}>
                      {log.matchedVersionIds.length}
                    </Badge>
                  </TCell>
                  <TCell>
                    <Badge tone={log.deniedVersionIds.length > 0 ? "warning" : "neutral"}>
                      {log.deniedVersionIds.length}
                    </Badge>
                  </TCell>
                </TRow>
              ))}
              {controller.retrievalLogs.length === 0 ? (
                <TRow>
                  <TCell colSpan={5}>No retrieval events recorded yet.</TCell>
                </TRow>
              ) : null}
            </tbody>
          </Table>
        </SectionCard>
      ) : null}
    </section>
  );
}
