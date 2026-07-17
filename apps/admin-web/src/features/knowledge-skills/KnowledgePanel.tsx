import { Badge, Button, Drawer, Field, Input, SectionCard, Select, Table, TCell, THead, TRow } from "@evcp/ui";
import { useState } from "react";
import type { KnowledgeSkillsController } from "./use-knowledge-skills";
import {
  KNOWLEDGE_SOURCE_TYPES,
  SCOPE_VISIBILITIES,
  type KnowledgeSourceType,
  type KnowledgeSource,
  type ScopeVisibility
} from "./types";

function indexTone(status: string) {
  if (status === "indexed") return "success" as const;
  if (status === "failed") return "danger" as const;
  return "warning" as const;
}

export function KnowledgePanel({ controller }: { controller: KnowledgeSkillsController }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [versionFor, setVersionFor] = useState<KnowledgeSource>();

  const [title, setTitle] = useState("");
  const [sourceType, setSourceType] = useState<KnowledgeSourceType>("markdown");
  const [visibility, setVisibility] = useState<ScopeVisibility>("global");
  const [scopeValue, setScopeValue] = useState("");
  const [tags, setTags] = useState("");

  const [contentHash, setContentHash] = useState("");
  const [changelog, setChangelog] = useState("");
  const [excerpts, setExcerpts] = useState("");

  function resetCreate() {
    setTitle("");
    setSourceType("markdown");
    setVisibility("global");
    setScopeValue("");
    setTags("");
  }

  async function submitCreate() {
    const scope: KnowledgeSource["scope"] = { visibility };
    if (visibility === "department") scope.department = scopeValue;
    if (visibility === "project") scope.projectIds = scopeValue ? [scopeValue] : [];
    if (visibility === "app") scope.appIds = scopeValue ? [scopeValue] : [];
    await controller.addSource({
      title,
      sourceType,
      scope,
      tags: tags ? tags.split(",").map((tag) => tag.trim()).filter(Boolean) : undefined
    });
    resetCreate();
    setCreateOpen(false);
  }

  async function submitVersion() {
    if (!versionFor) return;
    await controller.addKnowledgeVersion(versionFor.id, {
      contentHash,
      changelog,
      chunkCount: excerpts ? excerpts.split("\n").filter(Boolean).length : 0,
      excerpts: excerpts ? excerpts.split("\n").map((line) => line.trim()).filter(Boolean) : undefined
    });
    setContentHash("");
    setChangelog("");
    setExcerpts("");
    setVersionFor(undefined);
  }

  return (
    <section className="flex flex-col gap-6">
      <SectionCard
        eyebrow="Knowledge"
        title="Central knowledge sources"
        actions={<Button onClick={() => setCreateOpen(true)}>+ New source</Button>}
      >
        <Table>
          <THead>
            <TRow>
              <TCell>Source</TCell>
              <TCell>Type</TCell>
              <TCell>Scope</TCell>
              <TCell>Index</TCell>
              <TCell>Status</TCell>
              <TCell>Actions</TCell>
            </TRow>
          </THead>
          <tbody>
            {controller.sources.map((source) => (
              <TRow key={source.id}>
                <TCell>{source.title}</TCell>
                <TCell>{source.sourceType}</TCell>
                <TCell>{source.scope.visibility}</TCell>
                <TCell>
                  <Badge tone={indexTone(source.indexStatus)}>{source.indexStatus}</Badge>
                </TCell>
                <TCell>{source.status}</TCell>
                <TCell>
                  <Button variant="ghost" onClick={() => setVersionFor(source)}>
                    Version
                  </Button>
                </TCell>
              </TRow>
            ))}
            {controller.sources.length === 0 ? (
              <TRow>
                <TCell colSpan={6}>No knowledge sources yet. Create one to start indexing.</TCell>
              </TRow>
            ) : null}
          </tbody>
        </Table>
      </SectionCard>

      {controller.pendingKnowledge.length > 0 ? (
        <SectionCard eyebrow="Governance" title="Versions awaiting approval">
          <Table>
            <THead>
              <TRow>
                <TCell>Version</TCell>
                <TCell>Source</TCell>
                <TCell>Changelog</TCell>
                <TCell>Status</TCell>
                <TCell>Actions</TCell>
              </TRow>
            </THead>
            <tbody>
              {controller.pendingKnowledge.map((version) => (
                <TRow key={version.id}>
                  <TCell>{version.version}</TCell>
                  <TCell>{version.sourceId}</TCell>
                  <TCell>{version.changelog}</TCell>
                  <TCell>
                    <Badge tone={version.approvalStatus === "approved" ? "success" : "warning"}>
                      {version.approvalStatus}
                    </Badge>
                  </TCell>
                  <TCell>
                    {version.approvalStatus === "pending" ? (
                      <div className="flex gap-2">
                        <Button onClick={() => void controller.approveKnowledge(version.id, "approved")}>
                          Approve
                        </Button>
                        <Button
                          variant="ghost"
                          onClick={() => void controller.approveKnowledge(version.id, "rejected")}
                        >
                          Reject
                        </Button>
                      </div>
                    ) : null}
                  </TCell>
                </TRow>
              ))}
            </tbody>
          </Table>
        </SectionCard>
      ) : null}

      <Drawer
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New knowledge source"
        description="Register an organizational document so agents can retrieve it under governance."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submitCreate()} disabled={!title.trim()}>
              Create source
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Title">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Coding standards handbook" />
          </Field>
          <Field label="Source type">
            <Select value={sourceType} onChange={(event) => setSourceType(event.target.value as KnowledgeSourceType)}>
              {KNOWLEDGE_SOURCE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Scope">
            <Select value={visibility} onChange={(event) => setVisibility(event.target.value as ScopeVisibility)}>
              {SCOPE_VISIBILITIES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </Field>
          {visibility !== "global" && visibility !== "agent" ? (
            <Field label={`${visibility} id`} hint="Restricts retrieval to this scope.">
              <Input value={scopeValue} onChange={(event) => setScopeValue(event.target.value)} placeholder="dept:HR / prj_… / app:…" />
            </Field>
          ) : null}
          <Field label="Tags" hint="Comma-separated, optional.">
            <Input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="policy, hr" />
          </Field>
        </div>
      </Drawer>

      <Drawer
        open={Boolean(versionFor)}
        onClose={() => setVersionFor(undefined)}
        title={versionFor ? `New version · ${versionFor.title}` : "New version"}
        description="Submit indexed content for approval. Approve it below to make it retrievable."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setVersionFor(undefined)}>
              Cancel
            </Button>
            <Button onClick={() => void submitVersion()} disabled={!contentHash.trim()}>
              Submit version
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Content hash" hint="Digest of the indexed content.">
            <Input value={contentHash} onChange={(event) => setContentHash(event.target.value)} placeholder="sha256:…" />
          </Field>
          <Field label="Changelog">
            <Input value={changelog} onChange={(event) => setChangelog(event.target.value)} placeholder="Initial import" />
          </Field>
          <Field label="Excerpts" hint="One per line — injected into agent context on retrieval.">
            <textarea
              className="min-h-24 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-body outline-none focus:border-primary focus:ring-2 focus:ring-primary-soft"
              value={excerpts}
              onChange={(event) => setExcerpts(event.target.value)}
              placeholder={"Leave requests require manager approval.\nMax 20 days per year."}
            />
          </Field>
        </div>
      </Drawer>
    </section>
  );
}
