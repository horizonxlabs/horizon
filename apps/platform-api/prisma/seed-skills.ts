import { PrismaClient } from "@prisma/client";
import { DESIGN_SYSTEM_SKILL } from "../src/ai-governance/design-system-skill";

// Skill-governance seeding, extracted from seed.ts (that file is size-ratcheted and may
// only shrink). seedDesignSystemSkill runs on EVERY install; seedDemoLeaveSkill only
// behind the demo-project opt-in.

const prisma = new PrismaClient();

const bootstrapUserId = "usr_system_bootstrap";

export async function seedDesignSystemSkill() {
  // Built-in design playbook: globally assigned so EVERY project's generation loop can load
  // it on demand (progressive disclosure). Priority 10 — a project-scoped skill (priority 20)
  // an admin assigns still wins for its project.
  await prisma.skillDefinition.upsert({
    where: { key: DESIGN_SYSTEM_SKILL.key },
    update: {
      name: DESIGN_SYSTEM_SKILL.name,
      description: DESIGN_SYSTEM_SKILL.description,
      ownerUserId: bootstrapUserId,
      status: "active"
    },
    create: {
      id: "skdef_design_system",
      key: DESIGN_SYSTEM_SKILL.key,
      name: DESIGN_SYSTEM_SKILL.name,
      description: DESIGN_SYSTEM_SKILL.description,
      ownerUserId: bootstrapUserId,
      status: "active"
    }
  });

  await prisma.skillVersion.upsert({
    where: { id: "skver_design_system_v1" },
    update: {
      instruction: DESIGN_SYSTEM_SKILL.instruction,
      approvalStatus: "approved",
      lifecycleStatus: "active",
      isActive: true,
      approvedByUserId: bootstrapUserId,
      approvedAt: new Date("2026-08-14T00:00:00.000Z")
    },
    create: {
      id: "skver_design_system_v1",
      skillId: "skdef_design_system",
      version: "v1",
      instruction: DESIGN_SYSTEM_SKILL.instruction,
      inputSchema: { type: "object", required: ["prompt"] },
      outputSchema: { type: "object", required: ["artifact"] },
      requiredKnowledgeSourceIds: [],
      allowedTools: ["ui_generator"],
      contentHash: "sha256:seed-skill-design-system-v1",
      approvalStatus: "approved",
      lifecycleStatus: "active",
      isActive: true,
      approvedByUserId: bootstrapUserId,
      approvedAt: new Date("2026-08-14T00:00:00.000Z"),
      createdByUserId: bootstrapUserId
    }
  });

  await prisma.skillApproval.upsert({
    where: { id: "skapp_design_system_v1" },
    update: {
      decision: "approved",
      note: "Built-in enterprise design playbook.",
      decidedByUserId: bootstrapUserId
    },
    create: {
      id: "skapp_design_system_v1",
      skillId: "skdef_design_system",
      versionId: "skver_design_system_v1",
      decision: "approved",
      note: "Built-in enterprise design playbook.",
      decidedByUserId: bootstrapUserId,
      decidedAt: new Date("2026-08-14T00:00:00.000Z")
    }
  });

  await prisma.skillAssignment.upsert({
    where: { id: "skassign_design_system_global" },
    update: {
      skillId: "skdef_design_system",
      skillVersionId: "skver_design_system_v1",
      agentRole: "frontend_developer",
      scenario: "frontend_coding",
      scopeType: "global",
      scopeId: "global",
      priority: 10,
      status: "active"
    },
    create: {
      id: "skassign_design_system_global",
      skillId: "skdef_design_system",
      skillVersionId: "skver_design_system_v1",
      agentRole: "frontend_developer",
      scenario: "frontend_coding",
      scopeType: "global",
      scopeId: "global",
      priority: 10,
      status: "active"
    }
  });
}

export async function seedDemoLeaveSkill() {
  await prisma.skillDefinition.upsert({
    where: { key: "frontend-developer-leave" },
    update: {
      name: "Frontend Developer Leave Skill",
      description: "Generate governed leave management frontend changes.",
      ownerUserId: "usr_admin",
      status: "active"
    },
    create: {
      id: "skdef_frontend_developer_leave",
      key: "frontend-developer-leave",
      name: "Frontend Developer Leave Skill",
      description: "Generate governed leave management frontend changes.",
      ownerUserId: "usr_admin",
      status: "active"
    }
  });

  await prisma.skillVersion.upsert({
    where: { id: "skver_frontend_developer_leave_v1" },
    update: {
      instruction: "Use approved leave policy knowledge before generating frontend changes.",
      inputSchema: { type: "object", required: ["prompt"] },
      outputSchema: { type: "object", required: ["preview"] },
      requiredKnowledgeSourceIds: ["knsrc_leave_policy_001"],
      allowedTools: ["prd_reader", "ui_generator", "policy_checker"],
      approvalStatus: "approved",
      lifecycleStatus: "active",
      isActive: true,
      approvedByUserId: "usr_admin",
      approvedAt: new Date("2026-09-08T09:10:00.000Z")
    },
    create: {
      id: "skver_frontend_developer_leave_v1",
      skillId: "skdef_frontend_developer_leave",
      version: "v1",
      instruction: "Use approved leave policy knowledge before generating frontend changes.",
      inputSchema: { type: "object", required: ["prompt"] },
      outputSchema: { type: "object", required: ["preview"] },
      requiredKnowledgeSourceIds: ["knsrc_leave_policy_001"],
      allowedTools: ["prd_reader", "ui_generator", "policy_checker"],
      contentHash: "sha256:seed-skill-frontend-leave-v1",
      approvalStatus: "approved",
      lifecycleStatus: "active",
      isActive: true,
      approvedByUserId: "usr_admin",
      approvedAt: new Date("2026-09-08T09:10:00.000Z"),
      createdByUserId: "usr_admin"
    }
  });

  await prisma.skillApproval.upsert({
    where: { id: "skapp_frontend_developer_leave_v1" },
    update: {
      decision: "approved",
      note: "Approved Sprint 11 active skill contract.",
      decidedByUserId: "usr_admin"
    },
    create: {
      id: "skapp_frontend_developer_leave_v1",
      skillId: "skdef_frontend_developer_leave",
      versionId: "skver_frontend_developer_leave_v1",
      decision: "approved",
      note: "Approved Sprint 11 active skill contract.",
      decidedByUserId: "usr_admin",
      decidedAt: new Date("2026-09-08T09:11:00.000Z")
    }
  });

  await prisma.skillAssignment.upsert({
    where: { id: "skassign_frontend_leave_project" },
    update: {
      skillId: "skdef_frontend_developer_leave",
      skillVersionId: "skver_frontend_developer_leave_v1",
      agentRole: "frontend_developer",
      scenario: "frontend_coding",
      scopeType: "project",
      scopeId: "prj_leave_management",
      projectId: "prj_leave_management",
      appId: "app_leave_management",
      department: "HR Department",
      priority: 20,
      status: "active"
    },
    create: {
      id: "skassign_frontend_leave_project",
      skillId: "skdef_frontend_developer_leave",
      skillVersionId: "skver_frontend_developer_leave_v1",
      agentRole: "frontend_developer",
      scenario: "frontend_coding",
      scopeType: "project",
      scopeId: "prj_leave_management",
      projectId: "prj_leave_management",
      appId: "app_leave_management",
      department: "HR Department",
      priority: 20,
      status: "active"
    }
  });
}
