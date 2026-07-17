import { Badge, Button, Drawer, Field, Input, MarkdownEditor, SectionCard, Select, Table, TCell, THead, TRow } from "@evcp/ui";
import { useState } from "react";
import type { KnowledgeSkillsController } from "./use-knowledge-skills";
import {
  AGENT_ROLES,
  AI_SCENARIOS,
  SCOPE_VISIBILITIES,
  type AgentRoleKey,
  type AiScenario,
  type ScopeVisibility,
  type SkillDefinition
} from "./types";

function skillTone(status: string) {
  if (status === "active") return "success" as const;
  if (status === "disabled" || status === "deprecated") return "danger" as const;
  return "warning" as const;
}

export function SkillsPanel({ controller }: { controller: KnowledgeSkillsController }) {
  const [createOpen, setCreateOpen] = useState(false);
  const [versionFor, setVersionFor] = useState<SkillDefinition>();
  const [assignOpen, setAssignOpen] = useState(false);

  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const [instruction, setInstruction] = useState("");
  const [allowedTools, setAllowedTools] = useState("");

  const [skillVersionId, setSkillVersionId] = useState("");
  const [agentRole, setAgentRole] = useState<AgentRoleKey>("frontend_developer");
  const [scenario, setScenario] = useState<AiScenario>("frontend_coding");
  const [scopeType, setScopeType] = useState<ScopeVisibility>("global");
  const [scopeId, setScopeId] = useState("global");
  const [priority, setPriority] = useState("0");

  async function submitCreate() {
    await controller.addSkill({ key, name, description: description || undefined });
    setKey("");
    setName("");
    setDescription("");
    setCreateOpen(false);
  }

  async function submitVersion() {
    if (!versionFor) return;
    await controller.addSkillVersion(versionFor.id, {
      instruction,
      allowedTools: allowedTools ? allowedTools.split(",").map((tool) => tool.trim()).filter(Boolean) : undefined
    });
    setInstruction("");
    setAllowedTools("");
    setVersionFor(undefined);
  }

  async function submitAssign() {
    await controller.assign({
      skillVersionId,
      agentRole,
      scenario,
      scopeType,
      scopeId,
      priority: Number(priority) || 0
    });
    setSkillVersionId("");
    setAssignOpen(false);
  }

  return (
    <section className="flex flex-col gap-6">
      <SectionCard
        eyebrow="Skills"
        title="Central agent skills"
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setAssignOpen(true)}>
              Assign
            </Button>
            <Button onClick={() => setCreateOpen(true)}>+ New skill</Button>
          </div>
        }
      >
        <Table>
          <THead>
            <TRow>
              <TCell>Skill</TCell>
              <TCell>Key</TCell>
              <TCell>Status</TCell>
              <TCell>Actions</TCell>
            </TRow>
          </THead>
          <tbody>
            {controller.skills.map((skill) => (
              <TRow key={skill.id}>
                <TCell>{skill.name}</TCell>
                <TCell>{skill.key}</TCell>
                <TCell>
                  <Badge tone={skillTone(skill.status)}>{skill.status}</Badge>
                </TCell>
                <TCell>
                  <div className="flex gap-2">
                    <Button variant="ghost" onClick={() => setVersionFor(skill)}>
                      Version
                    </Button>
                    {skill.status !== "disabled" ? (
                      <Button
                        variant="ghost"
                        onClick={() => void controller.turnOffSkill(skill.id, "Disabled from admin console")}
                      >
                        Disable
                      </Button>
                    ) : null}
                  </div>
                </TCell>
              </TRow>
            ))}
            {controller.skills.length === 0 ? (
              <TRow>
                <TCell colSpan={4}>No skills yet. Create one to give agents a governed workflow.</TCell>
              </TRow>
            ) : null}
          </tbody>
        </Table>
      </SectionCard>

      {controller.pendingSkillVersions.length > 0 ? (
        <SectionCard eyebrow="Governance" title="Skill versions awaiting approval">
          <Table>
            <THead>
              <TRow>
                <TCell>Version</TCell>
                <TCell>Skill</TCell>
                <TCell>Status</TCell>
                <TCell>Actions</TCell>
              </TRow>
            </THead>
            <tbody>
              {controller.pendingSkillVersions.map((version) => (
                <TRow key={version.id}>
                  <TCell>{version.version}</TCell>
                  <TCell>{version.skillId}</TCell>
                  <TCell>
                    <Badge tone={version.approvalStatus === "approved" ? "success" : "warning"}>
                      {version.approvalStatus}
                    </Badge>
                  </TCell>
                  <TCell>
                    {version.approvalStatus === "pending" ? (
                      <div className="flex gap-2">
                        <Button onClick={() => void controller.approveSkill(version.id, "approved")}>
                          Approve
                        </Button>
                        <Button variant="ghost" onClick={() => void controller.approveSkill(version.id, "rejected")}>
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted">{version.id}</span>
                    )}
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
        title="New skill"
        description="Define a reusable, governed workflow agents can be assigned to."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submitCreate()} disabled={!key.trim() || !name.trim()}>
              Create skill
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Key" hint="Stable identifier, e.g. create_crud_app.">
            <Input value={key} onChange={(event) => setKey(event.target.value)} placeholder="create_approval_workflow" />
          </Field>
          <Field label="Name">
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Create Approval Workflow" />
          </Field>
          <Field label="Description">
            <Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Standard approve/reject/escalate flow" />
          </Field>
        </div>
      </Drawer>

      <Drawer
        open={Boolean(versionFor)}
        size="lg"
        onClose={() => setVersionFor(undefined)}
        title={versionFor ? `New version · ${versionFor.name}` : "New version"}
        description="Submit the instruction for approval. Approve it below to activate it."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setVersionFor(undefined)}>
              Cancel
            </Button>
            <Button onClick={() => void submitVersion()} disabled={!instruction.trim()}>
              Submit version
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Instruction (Markdown)" hint="The workflow/prompt the agent follows. Write in Markdown; use the Preview tab to view it.">
            <MarkdownEditor
              value={instruction}
              onChange={setInstruction}
              rows={10}
              placeholder={"# Create Approval Workflow\n\n1. Add a **submit** action\n2. Route to the manager for **approve/reject**\n3. Escalate after 48h\n\nUse the org's `ApprovalCard` component."}
            />
          </Field>
          <Field label="Allowed tools" hint="Comma-separated, optional.">
            <Input value={allowedTools} onChange={(event) => setAllowedTools(event.target.value)} placeholder="write_file, run_shell" />
          </Field>
        </div>
      </Drawer>

      <Drawer
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        title="Assign skill"
        description="Bind an approved skill version to a role, scenario and scope."
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setAssignOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submitAssign()} disabled={!skillVersionId.trim()}>
              Assign
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Skill version id" hint="An approved version id (from the approval step).">
            <Input value={skillVersionId} onChange={(event) => setSkillVersionId(event.target.value)} placeholder="skv_…" />
          </Field>
          <Field label="Agent role">
            <Select value={agentRole} onChange={(event) => setAgentRole(event.target.value as AgentRoleKey)}>
              {AGENT_ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Scenario">
            <Select value={scenario} onChange={(event) => setScenario(event.target.value as AiScenario)}>
              {AI_SCENARIOS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Scope">
            <Select value={scopeType} onChange={(event) => setScopeType(event.target.value as ScopeVisibility)}>
              {SCOPE_VISIBILITIES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Scope id">
            <Input value={scopeId} onChange={(event) => setScopeId(event.target.value)} placeholder="global" />
          </Field>
          <Field label="Priority" hint="Higher wins when multiple skills match.">
            <Input value={priority} onChange={(event) => setPriority(event.target.value)} inputMode="numeric" placeholder="0" />
          </Field>
        </div>
      </Drawer>
    </section>
  );
}
