import { PrismaClient } from "@prisma/client";
import { seedDesignSystemSkill, seedDemoLeaveSkill } from "./seed-skills";
import { seedImageGeneration } from "./seed-ai-image";

const prisma = new PrismaClient();

const roles = [
  {
    id: "role_admin",
    key: "admin",
    name: "Platform Admin",
    permissions: ["platform:admin", "ai:manage", "guardrail:manage", "audit:view"]
  },
  {
    id: "role_creator",
    key: "creator",
    name: "Creator",
    permissions: ["project:create", "project:update", "app:publish-request", "ticket:manage"]
  },
  {
    id: "role_end_user",
    key: "end_user",
    name: "End User",
    permissions: ["store:view", "ticket:create", "access:request"]
  }
];

const users = [
  { id: "usr_admin", email: "admin@company.com", name: "Admin User", roleId: "role_admin" },
  { id: "usr_creator", email: "creator@company.com", name: "Creator User", roleId: "role_creator" },
  { id: "usr_end_user", email: "user@company.com", name: "End User", roleId: "role_end_user" }
];

const systemBootstrapUser = {
  id: "usr_system_bootstrap",
  email: "system-bootstrap@invalid.local",
  name: "System Bootstrap"
};

async function seedKeycloakProvider() {
  await prisma.authProviderConfig.upsert({
    where: { id: "authprov_keycloak_default_001" },
    update: {
      providerType: "keycloak", name: "Bundled Keycloak Default", status: "active",
      issuerUrl: "http://keycloak:8080/realms/evcp",
      groupRoleMapping: { "evcp-admins": ["admin"], "evcp-creators": ["creator"], "evcp-users": ["end_user"] }
    },
    create: {
      id: "authprov_keycloak_default_001", providerType: "keycloak", name: "Bundled Keycloak Default", status: "active",
      issuerUrl: "http://keycloak:8080/realms/evcp", scopes: ["openid", "profile", "email"],
      groupRoleMapping: { "evcp-admins": ["admin"], "evcp-creators": ["creator"], "evcp-users": ["end_user"] }, createdByUserId: systemBootstrapUser.id
    }
  });
}


async function main() {
  for (const role of roles) {
    await prisma.platformRole.upsert({
      where: { key: role.key },
      update: { name: role.name, permissions: role.permissions },
      create: role
    });
  }

  await prisma.platformUser.upsert({
    where: { email: systemBootstrapUser.email },
    update: { name: systemBootstrapUser.name, status: "active" },
    create: { ...systemBootstrapUser, status: "active" }
  });

  // Keycloak is required for every private-server installation; all human identities
  // and sample business data are explicit local-demo opt-ins.
  await seedKeycloakProvider();
  await seedDesignSystemSkill();
  if (process.env.EVCP_SEED_DEMO_PROJECT !== "1") return;

  await prisma.platformGroup.upsert({
    where: { key: "hr_department" },
    update: { name: "HR Department" },
    create: { id: "grp_hr_department", key: "hr_department", name: "HR Department" }
  });

  for (const user of users) {
    await prisma.platformUser.upsert({
      where: { email: user.email },
      update: { name: user.name, status: "active" },
      create: { id: user.id, email: user.email, name: user.name, status: "active" }
    });

    await prisma.platformUserRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: user.roleId } },
      update: {},
      create: { userId: user.id, roleId: user.roleId }
    });
  }

  await prisma.platformUserGroup.upsert({
    where: { userId_groupId: { userId: "usr_creator", groupId: "grp_hr_department" } },
    update: {},
    create: { userId: "usr_creator", groupId: "grp_hr_department" }
  });
  await prisma.project.upsert({
    where: { id: "prj_leave_management" },
    update: {
      name: "Leave Management",
      status: "draft",
      ownerUserId: "usr_creator",
      appType: "Workflow App",
      businessProblem: "Employees need a self-service leave request and manager approval workflow.",
      targetDepartment: "HR Department",
      intendedUsers: ["Employee", "Manager", "HR Admin"],
      dataSensitivity: "internal"
    },
    create: {
      id: "prj_leave_management",
      name: "Leave Management",
      status: "draft",
      ownerUserId: "usr_creator",
      appType: "Workflow App",
      businessProblem: "Employees need a self-service leave request and manager approval workflow.",
      targetDepartment: "HR Department",
      intendedUsers: ["Employee", "Manager", "HR Admin"],
      dataSensitivity: "internal"
    }
  });

  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: "prj_leave_management", userId: "usr_creator" } },
    update: { role: "owner" },
    create: { projectId: "prj_leave_management", userId: "usr_creator", role: "owner" }
  });

  await prisma.app.upsert({
    where: { id: "app_leave_management" },
    update: { name: "Leave Management", status: "draft", projectId: "prj_leave_management" },
    create: {
      id: "app_leave_management",
      slug: "leave-management",
      name: "Leave Management",
      status: "draft",
      projectId: "prj_leave_management",
      databaseSchemaName: "app_leave_management"
    }
  });

  await prisma.appRole.upsert({
    where: { appId_key: { appId: "app_leave_management", key: "employee" } },
    update: { name: "Employee", permissions: ["leave:request", "leave:view-own"] },
    create: {
      id: "app_role_leave_employee",
      appId: "app_leave_management",
      key: "employee",
      name: "Employee",
      permissions: ["leave:request", "leave:view-own"]
    }
  });

  await prisma.appRole.upsert({
    where: { appId_key: { appId: "app_leave_management", key: "manager" } },
    update: { name: "Manager", permissions: ["leave:approve", "leave:view-team"] },
    create: {
      id: "app_role_leave_manager",
      appId: "app_leave_management",
      key: "manager",
      name: "Manager",
      permissions: ["leave:approve", "leave:view-team"]
    }
  });

  await prisma.appRole.upsert({
    where: { appId_key: { appId: "app_leave_management", key: "hr_admin" } },
    update: { name: "HR Admin", permissions: ["leave:admin", "leave:report"] },
    create: {
      id: "app_role_leave_hr_admin",
      appId: "app_leave_management",
      key: "hr_admin",
      name: "HR Admin",
      permissions: ["leave:admin", "leave:report"]
    }
  });

  await prisma.appMember.upsert({
    where: {
      appId_userId_roleId: {
        appId: "app_leave_management",
        userId: "usr_end_user",
        roleId: "app_role_leave_employee"
      }
    },
    update: {},
    create: {
      appId: "app_leave_management",
      userId: "usr_end_user",
      roleId: "app_role_leave_employee"
    }
  });

  await prisma.appMember.upsert({
    where: {
      appId_userId_roleId: {
        appId: "app_leave_management",
        userId: "usr_creator",
        roleId: "app_role_leave_hr_admin"
      }
    },
    update: {},
    create: {
      appId: "app_leave_management",
      userId: "usr_creator",
      roleId: "app_role_leave_hr_admin"
    }
  });

  await prisma.auditLog.upsert({
    where: { id: "aud_seed_sprint1" },
    update: {
      action: "seed.sprint1",
      resourceType: "platform",
      resourceId: "sprint1"
    },
    create: {
      id: "aud_seed_sprint1",
      actorUserId: "usr_admin",
      action: "seed.sprint1",
      resourceType: "platform",
      resourceId: "sprint1",
      severity: "info",
      metadata: { source: "apps/platform-api/prisma/seed.ts" }
    }
  });

  await prisma.aiProvider.upsert({
    where: { id: "aip_openai_production" },
    update: {
      name: "OpenAI Production",
      adapter: "openai",
      baseUrl: "https://api.openai.com/v1",
      models: ["gpt-4.1", "gpt-4.1-mini"],
      status: "active"
    },
    create: {
      id: "aip_openai_production",
      name: "OpenAI Production",
      adapter: "openai",
      baseUrl: "https://api.openai.com/v1",
      models: ["gpt-4.1", "gpt-4.1-mini"],
      status: "active"
    }
  });

  await prisma.aiApiKey.upsert({
    where: { id: "aik_openai_primary" },
    update: {
      name: "Primary Production Key",
      usageMode: "production",
      quotaTokens: 100000,
      fallbackPriority: 1,
      fingerprint: "fp_seed_demo_001",
      maskedValue: "sk-...demo",
      secretCiphertext: "local-envelope:c2VlZC1kZW1vLWtleQ==",
      keyVersion: 1,
      encryptionProvider: "local-envelope",
      status: "active"
    },
    create: {
      id: "aik_openai_primary",
      providerId: "aip_openai_production",
      name: "Primary Production Key",
      usageMode: "production",
      quotaTokens: 100000,
      fallbackPriority: 1,
      fingerprint: "fp_seed_demo_001",
      maskedValue: "sk-...demo",
      secretCiphertext: "local-envelope:c2VlZC1kZW1vLWtleQ==",
      keyVersion: 1,
      encryptionProvider: "local-envelope",
      status: "active"
    }
  });

  // Text scenarios only — image_generation routes to the Gemini provider in seed-ai-image.ts.
  const textScenarios = ["prd_generation", "requirement_analysis", "frontend_coding",
    "backend_coding", "review", "documentation"];
  for (const scenario of textScenarios) {
    await prisma.aiScenarioRoute.upsert({
      where: { scenario },
      update: {
        primaryProviderId: "aip_openai_production",
        primaryModel: "gpt-4.1",
        fallbackProviderId: null,
        fallbackModel: null
      },
      create: {
        id: `air_${scenario}`,
        scenario,
        primaryProviderId: "aip_openai_production",
        primaryModel: "gpt-4.1"
      }
    });
  }
  await seedImageGeneration(prisma);

  await prisma.aiQuota.upsert({
    where: { scope: "organization" },
    update: {
      dailyLimit: 1000,
      monthlyLimit: 5000,
      warningThreshold: 800,
      hardStop: true,
      usedToday: 0
    },
    create: {
      id: "aiq_organization",
      scope: "organization",
      dailyLimit: 1000,
      monthlyLimit: 5000,
      warningThreshold: 800,
      hardStop: true,
      usedToday: 0
    }
  });

  await prisma.guardrailRule.upsert({
    where: { id: "grd_block_payroll_export" },
    update: {
      name: "Block payroll export",
      type: "keyword",
      pattern: "payroll export",
      severity: "high",
      action: "block",
      scope: "organization",
      status: "active"
    },
    create: {
      id: "grd_block_payroll_export",
      name: "Block payroll export",
      type: "keyword",
      pattern: "payroll export",
      severity: "high",
      action: "block",
      scope: "organization",
      status: "active"
    }
  });

  await prisma.guardrailEvent.upsert({
    where: { id: "gre_seed_blocked_prompt" },
    update: {
      prompt: "Generate payroll export report",
      scenario: "prd_generation",
      decision: "block",
      matchedRuleId: "grd_block_payroll_export",
      matchedRuleName: "Block payroll export",
      severity: "high"
    },
    create: {
      id: "gre_seed_blocked_prompt",
      actorUserId: "usr_admin",
      prompt: "Generate payroll export report",
      scenario: "prd_generation",
      decision: "block",
      matchedRuleId: "grd_block_payroll_export",
      matchedRuleName: "Block payroll export",
      severity: "high"
    }
  });

  await prisma.prdDocument.upsert({
    where: { projectId: "prj_leave_management" },
    update: {
      status: "baseline_confirmed"
    },
    create: {
      id: "prddoc_prj_leave_management",
      projectId: "prj_leave_management",
      status: "baseline_confirmed"
    }
  });

  await prisma.prdVersion.upsert({
    where: { id: "prdver_prj_leave_management_draft_01" },
    update: {
      version: "0.1",
      status: "draft",
      isBaseline: false,
      sourcePrompt: "Create a PRD for Leave Management.",
      changeSummary: "Generated initial PRD draft for Leave Management",
      generatedBy: {
        scenario: "prd_generation",
        providerId: "aip_openai_production",
        model: "gpt-4.1"
      },
      createdByUserId: "usr_creator"
    },
    create: {
      id: "prdver_prj_leave_management_draft_01",
      documentId: "prddoc_prj_leave_management",
      version: "0.1",
      status: "draft",
      isBaseline: false,
      sourcePrompt: "Create a PRD for Leave Management.",
      changeSummary: "Generated initial PRD draft for Leave Management",
      generatedBy: {
        scenario: "prd_generation",
        providerId: "aip_openai_production",
        model: "gpt-4.1"
      },
      createdByUserId: "usr_creator"
    }
  });

  await prisma.prdVersion.upsert({
    where: { id: "prdver_prj_leave_management_baseline_v1_0" },
    update: {
      version: "1.0",
      status: "baseline",
      isBaseline: true,
      sourcePrompt: "Create a PRD for Leave Management.",
      changeSummary: "Baseline v1.0 confirmed for Leave Management",
      generatedBy: {
        scenario: "prd_generation",
        providerId: "aip_openai_production",
        model: "gpt-4.1"
      },
      createdByUserId: "usr_creator"
    },
    create: {
      id: "prdver_prj_leave_management_baseline_v1_0",
      documentId: "prddoc_prj_leave_management",
      version: "1.0",
      status: "baseline",
      isBaseline: true,
      sourcePrompt: "Create a PRD for Leave Management.",
      changeSummary: "Baseline v1.0 confirmed for Leave Management",
      generatedBy: {
        scenario: "prd_generation",
        providerId: "aip_openai_production",
        model: "gpt-4.1"
      },
      createdByUserId: "usr_creator"
    }
  });

  await prisma.prdDocument.update({
    where: { projectId: "prj_leave_management" },
    data: {
      currentVersionId: "prdver_prj_leave_management_baseline_v1_0",
      baselineVersionId: "prdver_prj_leave_management_baseline_v1_0"
    }
  });

  const prdSections = [
    ["overview", "Overview", "Leave Management is a Workflow App for HR Department."],
    [
      "business_objective",
      "Business Objective",
      "Employees need self-service leave requests with manager approval."
    ],
    ["users_roles", "Users and Roles", "Primary users are Employee, Manager and HR Admin."],
    [
      "core_flows",
      "Core Flows",
      "Create request, manager review, HR visibility and status tracking."
    ],
    [
      "data_model",
      "Data Model",
      "Employee, leave request, approval step, notification and audit event."
    ],
    [
      "acceptance_criteria",
      "Acceptance Criteria",
      "Creator can generate, review and confirm Baseline v1.0 before app generation."
    ]
  ];

  for (const [index, section] of prdSections.entries()) {
    const [key, title, body] = section;
    await prisma.prdSection.upsert({
      where: {
        versionId_key: {
          versionId: "prdver_prj_leave_management_baseline_v1_0",
          key
        }
      },
      update: { title, body, order: index + 1 },
      create: {
        id: `prdsec_prj_leave_management_${key}`,
        versionId: "prdver_prj_leave_management_baseline_v1_0",
        key,
        title,
        body,
        order: index + 1
      }
    });
  }

  await prisma.workspaceTask.upsert({
    where: { id: "wst_seed_leave_wfh" },
    update: {
      prompt: "Add WFH leave type",
      status: "ready",
      guardrailDecision: "allow",
      guardrailEventId: "gre_seed_workspace_allow",
      createdByUserId: "usr_creator"
    },
    create: {
      id: "wst_seed_leave_wfh",
      projectId: "prj_leave_management",
      prompt: "Add WFH leave type",
      status: "ready",
      guardrailDecision: "allow",
      guardrailEventId: "gre_seed_workspace_allow",
      createdByUserId: "usr_creator"
    }
  });

  const workspaceSteps = [
    "Understanding request",
    "Loading PRD baseline",
    "Guardrail pre-check",
    "Selecting skill",
    "Generating frontend",
    "Applying auth/role rules",
    "Building preview",
    "Running checks",
    "Ready"
  ];

  for (const [index, label] of workspaceSteps.entries()) {
    await prisma.workspaceTaskStep.upsert({
      where: { taskId_order: { taskId: "wst_seed_leave_wfh", order: index + 1 } },
      update: { label, status: "done" },
      create: {
        id: `wst_seed_leave_wfh_step_${index + 1}`,
        taskId: "wst_seed_leave_wfh",
        label,
        status: "done",
        order: index + 1
      }
    });
  }

  await prisma.previewVersion.upsert({
    where: { projectId_version: { projectId: "prj_leave_management", version: "preview-0001" } },
    update: {
      summary: "Mock preview updated: Add WFH leave type",
      device: "desktop",
      screenTitle: "Leave Management",
      highlights: ["WFH leave type", "Manager approval queue", "HR policy visibility"]
    },
    create: {
      id: "preview_prj_leave_management_0001",
      projectId: "prj_leave_management",
      version: "preview-0001",
      summary: "Mock preview updated: Add WFH leave type",
      device: "desktop",
      screenTitle: "Leave Management",
      highlights: ["WFH leave type", "Manager approval queue", "HR policy visibility"]
    }
  });

  await prisma.aiUsageLog.upsert({
    where: { id: "ailog_seed_leave_wfh" },
    update: {
      prompt: "Add WFH leave type",
      scenario: "frontend_coding",
      providerId: "aip_openai_production",
      model: "gpt-4.1",
      tokensUsed: 120
    },
    create: {
      id: "ailog_seed_leave_wfh",
      projectId: "prj_leave_management",
      taskId: "wst_seed_leave_wfh",
      actorUserId: "usr_creator",
      scenario: "frontend_coding",
      providerId: "aip_openai_production",
      model: "gpt-4.1",
      prompt: "Add WFH leave type",
      tokensUsed: 120
    }
  });

  const databaseTables = [
    {
      id: "dbtbl_leave_employees",
      key: "employees",
      displayName: "Employees",
      description: "Employee directory fields used by Leave Management.",
      columns: [
        ["dbcol_leave_employees_1", "id", "uuid", true, null],
        ["dbcol_leave_employees_2", "full_name", "text", true, null],
        ["dbcol_leave_employees_3", "manager_id", "uuid", false, null]
      ]
    },
    {
      id: "dbtbl_leave_requests",
      key: "leave_requests",
      displayName: "Leave Requests",
      description: "Employee leave requests including WFH leave type.",
      columns: [
        ["dbcol_leave_requests_1", "id", "uuid", true, null],
        ["dbcol_leave_requests_2", "employee_id", "uuid", true, null],
        ["dbcol_leave_requests_3", "leave_type", "text", true, "annual"],
        ["dbcol_leave_requests_4", "status", "text", true, "pending"]
      ]
    },
    {
      id: "dbtbl_leave_approval_steps",
      key: "approval_steps",
      displayName: "Approval Steps",
      description: "Manager approval queue entries linked to leave requests.",
      columns: [
        ["dbcol_leave_approval_steps_1", "id", "uuid", true, null],
        ["dbcol_leave_approval_steps_2", "leave_request_id", "uuid", true, null],
        ["dbcol_leave_approval_steps_3", "approver_id", "uuid", true, null],
        ["dbcol_leave_approval_steps_4", "decision", "text", false, null]
      ]
    }
  ];

  for (const table of databaseTables) {
    await prisma.appDatabaseTable.upsert({
      where: { projectId_key: { projectId: "prj_leave_management", key: table.key } },
      update: {
        displayName: table.displayName,
        description: table.description,
        source: "generated"
      },
      create: {
        id: table.id,
        projectId: "prj_leave_management",
        key: table.key,
        displayName: table.displayName,
        description: table.description,
        source: "generated"
      }
    });

    for (const [index, column] of table.columns.entries()) {
      const [id, name, dataType, required, defaultValue] = column;
      await prisma.appDatabaseColumn.upsert({
        where: { tableId_name: { tableId: table.id, name: String(name) } },
        update: {
          dataType: String(dataType),
          required: Boolean(required),
          defaultValue: defaultValue ? String(defaultValue) : null,
          source: "generated",
          order: index + 1
        },
        create: {
          id: String(id),
          tableId: table.id,
          name: String(name),
          dataType: String(dataType),
          required: Boolean(required),
          defaultValue: defaultValue ? String(defaultValue) : null,
          source: "generated",
          order: index + 1
        }
      });
    }
  }

  await prisma.appDatabaseRelationship.upsert({
    where: { id: "dbrel_leave_request_employee" },
    update: {
      sourceTable: "leave_requests",
      sourceColumn: "employee_id",
      targetTable: "employees",
      targetColumn: "id",
      cardinality: "one_to_many"
    },
    create: {
      id: "dbrel_leave_request_employee",
      projectId: "prj_leave_management",
      sourceTable: "leave_requests",
      sourceColumn: "employee_id",
      targetTable: "employees",
      targetColumn: "id",
      cardinality: "one_to_many"
    }
  });

  await prisma.appDatabaseRelationship.upsert({
    where: { id: "dbrel_approval_leave_request" },
    update: {
      sourceTable: "approval_steps",
      sourceColumn: "leave_request_id",
      targetTable: "leave_requests",
      targetColumn: "id",
      cardinality: "one_to_many"
    },
    create: {
      id: "dbrel_approval_leave_request",
      projectId: "prj_leave_management",
      sourceTable: "approval_steps",
      sourceColumn: "leave_request_id",
      targetTable: "leave_requests",
      targetColumn: "id",
      cardinality: "one_to_many"
    }
  });

  await prisma.appDatabaseSampleRecord.upsert({
    where: { tableId_ordinal: { tableId: "dbtbl_leave_requests", ordinal: 1 } },
    update: {
      data: { id: "lr_1001", employee_id: "emp_001", leave_type: "WFH", status: "pending" }
    },
    create: {
      id: "dbrec_leave_request_1",
      projectId: "prj_leave_management",
      tableId: "dbtbl_leave_requests",
      tableKey: "leave_requests",
      ordinal: 1,
      data: { id: "lr_1001", employee_id: "emp_001", leave_type: "WFH", status: "pending" }
    }
  });

  await prisma.appDatabaseSampleRecord.upsert({
    where: { tableId_ordinal: { tableId: "dbtbl_leave_requests", ordinal: 2 } },
    update: {
      data: { id: "lr_1002", employee_id: "emp_002", leave_type: "annual", status: "approved" }
    },
    create: {
      id: "dbrec_leave_request_2",
      projectId: "prj_leave_management",
      tableId: "dbtbl_leave_requests",
      tableKey: "leave_requests",
      ordinal: 2,
      data: { id: "lr_1002", employee_id: "emp_002", leave_type: "annual", status: "approved" }
    }
  });

  await prisma.appDatabaseMigration.upsert({
    where: {
      projectId_migrationId: {
        projectId: "prj_leave_management",
        migrationId: "2026081001_leave_management_base"
      }
    },
    update: {
      status: "applied",
      linkedPrdVersion: "1.0",
      linkedFrontendCheckpoint: "fe-0001",
      appliedAt: new Date("2026-08-10T09:00:00.000Z")
    },
    create: {
      id: "dbmig_leave_management_001",
      projectId: "prj_leave_management",
      migrationId: "2026081001_leave_management_base",
      status: "applied",
      createdByUserId: "usr_creator",
      linkedPrdVersion: "1.0",
      linkedFrontendCheckpoint: "fe-0001",
      appliedAt: new Date("2026-08-10T09:00:00.000Z")
    }
  });

  await prisma.frontendCheckpoint.upsert({
    where: { projectId_version: { projectId: "prj_leave_management", version: "fe-0001" } },
    update: {
      sourcePreviewVersion: "preview-0001",
      sourceTaskId: "wst_seed_leave_wfh",
      status: "current",
      checksum: "sha256:seedfe0001",
      fileManifest: ["src/pages/LeaveRequest.tsx", "src/components/ApprovalQueue.tsx"],
      routeSnapshot: ["/leave-requests", "/manager/approvals"],
      changeSummary: "Initial frontend checkpoint from WFH leave prompt",
      changedAreas: ["UI components", "Frontend routing", "CSS styles"],
      createdByUserId: "usr_creator",
      restoreSourceCheckpointId: null
    },
    create: {
      id: "fechk_leave_management_0001",
      projectId: "prj_leave_management",
      version: "fe-0001",
      sourcePreviewVersion: "preview-0001",
      sourceTaskId: "wst_seed_leave_wfh",
      status: "current",
      checksum: "sha256:seedfe0001",
      fileManifest: ["src/pages/LeaveRequest.tsx", "src/components/ApprovalQueue.tsx"],
      routeSnapshot: ["/leave-requests", "/manager/approvals"],
      changeSummary: "Initial frontend checkpoint from WFH leave prompt",
      changedAreas: ["UI components", "Frontend routing", "CSS styles"],
      createdByUserId: "usr_creator"
    }
  });

  await prisma.project.update({
    where: { id: "prj_leave_management" },
    data: { activeFrontendCheckpointId: "fechk_leave_management_0001" }
  });

  await prisma.appInvitation.upsert({
    where: { id: "appinv_leave_management_internal_manager" },
    update: {
      email: "manager@company.com",
      userType: "internal",
      roleKey: "manager",
      status: "pending",
      note: "Join manager approval queue"
    },
    create: {
      id: "appinv_leave_management_internal_manager",
      appId: "app_leave_management",
      projectId: "prj_leave_management",
      email: "manager@company.com",
      userType: "internal",
      roleKey: "manager",
      invitedByUserId: "usr_creator",
      status: "pending",
      note: "Join manager approval queue"
    }
  });

  await prisma.appInvitation.upsert({
    where: { id: "appinv_leave_management_external_vendor" },
    update: {
      email: "vendor@example.com",
      userType: "external",
      roleKey: "employee",
      status: "approval_required",
      policyWarning: "External invite requires approval before app access is activated.",
      expiresAt: new Date("2026-09-01T00:00:00.000Z")
    },
    create: {
      id: "appinv_leave_management_external_vendor",
      appId: "app_leave_management",
      projectId: "prj_leave_management",
      email: "vendor@example.com",
      userType: "external",
      roleKey: "employee",
      invitedByUserId: "usr_creator",
      status: "approval_required",
      policyWarning: "External invite requires approval before app access is activated.",
      expiresAt: new Date("2026-09-01T00:00:00.000Z"),
      note: "External vendor read access request"
    }
  });

  await prisma.appAccessRequest.upsert({
    where: { id: "appreq_leave_management_manager" },
    update: {
      requesterEmail: "manager@company.com",
      requestedRoleKey: "manager",
      reason: "Needs approval queue access",
      status: "pending"
    },
    create: {
      id: "appreq_leave_management_manager",
      appId: "app_leave_management",
      projectId: "prj_leave_management",
      requesterEmail: "manager@company.com",
      requestedRoleKey: "manager",
      reason: "Needs approval queue access",
      status: "pending"
    }
  });

  const leaveManifest = {
    app: {
      id: "app_leave_management",
      slug: "leave-management",
      name: "Leave Management",
      route: "/apps/leave-management"
    },
    prd: {
      versionId: "prdver_prj_leave_management_baseline_v1_0",
      version: "1.0"
    },
    frontend: {
      checkpointId: "fechk_leave_management_0001",
      version: "fe-0001"
    },
    auth: {
      mode: "platform_auth_sdk",
      accessMode: "restricted"
    },
    roles: ["employee", "manager", "hr_admin"]
  };

  await prisma.appManifest.upsert({
    where: { appId: "app_leave_management" },
    update: {
      manifestVersion: "1",
      prdVersionId: "prdver_prj_leave_management_baseline_v1_0",
      prdVersion: "1.0",
      frontendCheckpointId: "fechk_leave_management_0001",
      route: "/apps/leave-management",
      authMode: "platform_auth_sdk",
      roleSnapshot: leaveManifest.roles,
      databaseSnapshot: {
        schemaName: "app_leave_management",
        tables: ["employees", "leave_requests", "approval_steps"]
      },
      manifest: leaveManifest
    },
    create: {
      id: "manifest_leave_management_v1",
      appId: "app_leave_management",
      projectId: "prj_leave_management",
      manifestVersion: "1",
      prdVersionId: "prdver_prj_leave_management_baseline_v1_0",
      prdVersion: "1.0",
      frontendCheckpointId: "fechk_leave_management_0001",
      route: "/apps/leave-management",
      authMode: "platform_auth_sdk",
      roleSnapshot: leaveManifest.roles,
      databaseSnapshot: {
        schemaName: "app_leave_management",
        tables: ["employees", "leave_requests", "approval_steps"]
      },
      manifest: leaveManifest
    }
  });

  await prisma.publishRequest.upsert({
    where: { id: "pubreq_leave_management_001" },
    update: {
      status: "published",
      requestedByUserId: "usr_creator",
      manifestVersion: "1",
      blockingItems: [],
      publishedAt: new Date("2026-08-17T11:00:00.000Z")
    },
    create: {
      id: "pubreq_leave_management_001",
      appId: "app_leave_management",
      projectId: "prj_leave_management",
      status: "published",
      requestedByUserId: "usr_creator",
      manifestVersion: "1",
      blockingItems: [],
      publishedAt: new Date("2026-08-17T11:00:00.000Z")
    }
  });

  await prisma.deploymentRecord.upsert({
    where: { id: "dep_leave_management_001" },
    update: {
      publishRequestId: "pubreq_leave_management_001",
      status: "published",
      environment: "app_store",
      route: "/apps/leave-management",
      manifestVersion: "1",
      prdVersion: "1.0",
      frontendCheckpointId: "fechk_leave_management_0001",
      publishedByUserId: "usr_creator",
      publishedAt: new Date("2026-08-17T11:00:00.000Z")
    },
    create: {
      id: "dep_leave_management_001",
      appId: "app_leave_management",
      projectId: "prj_leave_management",
      publishRequestId: "pubreq_leave_management_001",
      status: "published",
      environment: "app_store",
      route: "/apps/leave-management",
      manifestVersion: "1",
      prdVersion: "1.0",
      frontendCheckpointId: "fechk_leave_management_0001",
      publishedByUserId: "usr_creator",
      publishedAt: new Date("2026-08-17T11:00:00.000Z")
    }
  });

  await prisma.appStoreRegistryEntry.upsert({
    where: { appId: "app_leave_management" },
    update: {
      projectId: "prj_leave_management",
      deploymentRecordId: "dep_leave_management_001",
      slug: "leave-management",
      name: "Leave Management",
      route: "/apps/leave-management",
      status: "published",
      visibility: "restricted",
      accessMode: "membership_or_invite",
      roleKeys: ["employee", "manager", "hr_admin"],
      ownerUserId: "usr_creator",
      manifestVersion: "1",
      publishedAt: new Date("2026-08-17T11:00:00.000Z")
    },
    create: {
      id: "store_leave_management",
      appId: "app_leave_management",
      projectId: "prj_leave_management",
      deploymentRecordId: "dep_leave_management_001",
      slug: "leave-management",
      name: "Leave Management",
      route: "/apps/leave-management",
      status: "published",
      visibility: "restricted",
      accessMode: "membership_or_invite",
      roleKeys: ["employee", "manager", "hr_admin"],
      ownerUserId: "usr_creator",
      manifestVersion: "1",
      publishedAt: new Date("2026-08-17T11:00:00.000Z")
    }
  });

  await prisma.generatedAppRuntime.upsert({
    where: { id: "garun_leave_management_001" },
    update: {
      artifactRoot: "generated-apps/leave-management",
      requiredPaths: [
        "app.manifest.json",
        "package.json",
        "frontend/",
        "backend/",
        "prisma/",
        "openapi/",
        "tests/",
        "README.md"
      ],
      containerName: "evcp-app-leave-management-dep_leave_management_001",
      imageTag: "leave-management:1",
      route: "/apps/leave-management",
      healthEndpoint: "/apps/leave-management/health",
      readyEndpoint: "/apps/leave-management/ready",
      metricsEndpoint: "/apps/leave-management/metrics",
      status: "running"
    },
    create: {
      id: "garun_leave_management_001",
      appId: "app_leave_management",
      projectId: "prj_leave_management",
      deploymentRecordId: "dep_leave_management_001",
      artifactRoot: "generated-apps/leave-management",
      requiredPaths: [
        "app.manifest.json",
        "package.json",
        "frontend/",
        "backend/",
        "prisma/",
        "openapi/",
        "tests/",
        "README.md"
      ],
      containerName: "evcp-app-leave-management-dep_leave_management_001",
      imageTag: "leave-management:1",
      route: "/apps/leave-management",
      healthEndpoint: "/apps/leave-management/health",
      readyEndpoint: "/apps/leave-management/ready",
      metricsEndpoint: "/apps/leave-management/metrics",
      status: "running"
    }
  });

  await prisma.generatedAppSchemaGrant.upsert({
    where: { id: "gaschema_leave_management_001" },
    update: {
      schemaName: "app_leave_management",
      dbUser: "app_user_leave_management",
      allowedSchemas: ["app_leave_management"],
      deniedSchemas: ["public", "platform", "app_payroll"],
      status: "active"
    },
    create: {
      id: "gaschema_leave_management_001",
      runtimeId: "garun_leave_management_001",
      schemaName: "app_leave_management",
      dbUser: "app_user_leave_management",
      allowedSchemas: ["app_leave_management"],
      deniedSchemas: ["public", "platform", "app_payroll"],
      status: "active"
    }
  });

  await prisma.generatedAppHealthCheck.upsert({
    where: { id: "gahealth_leave_management_001" },
    update: {
      healthStatus: "healthy",
      readinessStatus: "ready",
      dependencies: { database: "healthy", platformAuth: "ready", route: "ready" },
      readinessGates: [
        "artifact_contract_present",
        "migrations_applied",
        "schema_grant_active",
        "platform_auth_ready",
        "route_registered"
      ],
      checkedAt: new Date("2026-08-17T11:05:00.000Z")
    },
    create: {
      id: "gahealth_leave_management_001",
      runtimeId: "garun_leave_management_001",
      healthStatus: "healthy",
      readinessStatus: "ready",
      dependencies: { database: "healthy", platformAuth: "ready", route: "ready" },
      readinessGates: [
        "artifact_contract_present",
        "migrations_applied",
        "schema_grant_active",
        "platform_auth_ready",
        "route_registered"
      ],
      checkedAt: new Date("2026-08-17T11:05:00.000Z")
    }
  });

  await prisma.generatedAppRuntimeLog.upsert({
    where: { id: "galog_leave_management_001" },
    update: {
      appId: "app_leave_management",
      deploymentId: "dep_leave_management_001",
      requestId: "req_leave_management_001",
      severity: "info",
      message: "Generated app runtime accepted authenticated request",
      metadata: { path: "/api/leave-requests", method: "GET" },
      occurredAt: new Date("2026-08-17T11:06:00.000Z")
    },
    create: {
      id: "galog_leave_management_001",
      runtimeId: "garun_leave_management_001",
      appId: "app_leave_management",
      deploymentId: "dep_leave_management_001",
      requestId: "req_leave_management_001",
      severity: "info",
      message: "Generated app runtime accepted authenticated request",
      metadata: { path: "/api/leave-requests", method: "GET" },
      occurredAt: new Date("2026-08-17T11:06:00.000Z")
    }
  });

  await prisma.generatedAppRuntimeMetric.upsert({
    where: { id: "gametric_leave_management_001" },
    update: {
      requestCount: 128,
      errorCount: 0,
      latencyP95Ms: 42,
      window: "last_15m",
      measuredAt: new Date("2026-08-17T11:07:00.000Z")
    },
    create: {
      id: "gametric_leave_management_001",
      runtimeId: "garun_leave_management_001",
      requestCount: 128,
      errorCount: 0,
      latencyP95Ms: 42,
      window: "last_15m",
      measuredAt: new Date("2026-08-17T11:07:00.000Z")
    }
  });

  await prisma.generatedAppOpenApiContract.upsert({
    where: { runtimeId: "garun_leave_management_001" },
    update: {
      version: "1.0.0",
      openapiPath: "generated-apps/leave-management/openapi/openapi.json",
      paths: [
        "/api/leave-requests",
        "/api/leave-requests/{id}",
        "/api/approval-steps",
        "/api/runtime/health"
      ],
      pathCount: 4
    },
    create: {
      id: "gaopenapi_leave_management_001",
      runtimeId: "garun_leave_management_001",
      version: "1.0.0",
      openapiPath: "generated-apps/leave-management/openapi/openapi.json",
      paths: [
        "/api/leave-requests",
        "/api/leave-requests/{id}",
        "/api/approval-steps",
        "/api/runtime/health"
      ],
      pathCount: 4
    }
  });

  await prisma.generatedAppMigrationReport.upsert({
    where: { id: "gamigration_leave_management_001" },
    update: {
      deploymentRecordId: "dep_leave_management_001",
      migrationId: "mig_leave_management_baseline",
      dryRunStatus: "passed",
      destructiveChanges: [],
      requiredApprovals: []
    },
    create: {
      id: "gamigration_leave_management_001",
      runtimeId: "garun_leave_management_001",
      deploymentRecordId: "dep_leave_management_001",
      migrationId: "mig_leave_management_baseline",
      dryRunStatus: "passed",
      destructiveChanges: [],
      requiredApprovals: []
    }
  });

  await prisma.supportTicket.upsert({
    where: { id: "ticket_leave_management_bug_001" },
    update: {
      ticketNumber: "TKT-0001",
      appSlug: "leave-management",
      submittedByEmail: "user@company.com",
      type: "bug",
      priority: "high",
      title: "WFH leave type missing",
      description: "The WFH option is not visible on mobile after publish.",
      deviceInfo: "iPhone Safari",
      screenshotUrl: null,
      status: "submitted",
      assignedToUserId: "usr_creator"
    },
    create: {
      id: "ticket_leave_management_bug_001",
      ticketNumber: "TKT-0001",
      appId: "app_leave_management",
      appSlug: "leave-management",
      projectId: "prj_leave_management",
      submittedByUserId: "usr_end_user",
      submittedByEmail: "user@company.com",
      type: "bug",
      priority: "high",
      title: "WFH leave type missing",
      description: "The WFH option is not visible on mobile after publish.",
      deviceInfo: "iPhone Safari",
      screenshotUrl: null,
      status: "submitted",
      assignedToUserId: "usr_creator"
    }
  });

  await prisma.supportTicketTimelineEntry.upsert({
    where: { id: "ticket_timeline_leave_management_submitted" },
    update: {
      ticketId: "ticket_leave_management_bug_001",
      status: "submitted",
      label: "Ticket submitted",
      actorUserId: "usr_end_user",
      occurredAt: new Date("2026-08-18T09:12:00.000Z")
    },
    create: {
      id: "ticket_timeline_leave_management_submitted",
      ticketId: "ticket_leave_management_bug_001",
      status: "submitted",
      label: "Ticket submitted",
      actorUserId: "usr_end_user",
      occurredAt: new Date("2026-08-18T09:12:00.000Z")
    }
  });

  await prisma.inAppNotification.upsert({
    where: { id: "noti_leave_management_ticket_created" },
    update: {
      userId: "usr_creator",
      projectId: "prj_leave_management",
      type: "ticket_update",
      title: "New ticket TKT-0001",
      body: "End User reported that WFH leave type is missing on mobile.",
      read: false,
      createdAt: new Date("2026-08-18T09:12:00.000Z")
    },
    create: {
      id: "noti_leave_management_ticket_created",
      userId: "usr_creator",
      projectId: "prj_leave_management",
      type: "ticket_update",
      title: "New ticket TKT-0001",
      body: "End User reported that WFH leave type is missing on mobile.",
      read: false,
      createdAt: new Date("2026-08-18T09:12:00.000Z")
    }
  });

  await prisma.prdVersion.upsert({
    where: { id: "prdver_prj_leave_management_change_01" },
    update: {
      status: "baseline",
      isBaseline: false,
      sourcePrompt: "Approved PRD change prdchg_leave_management_001",
      changeSummary: "Add WFH leave visibility requirement",
      generatedBy: {
        scenario: "requirement_analysis",
        providerId: "human_approval",
        model: "creator_review"
      },
      createdByUserId: "usr_creator"
    },
    create: {
      id: "prdver_prj_leave_management_change_01",
      documentId: "prddoc_prj_leave_management",
      version: "1.1",
      status: "baseline",
      isBaseline: false,
      sourcePrompt: "Approved PRD change prdchg_leave_management_001",
      changeSummary: "Add WFH leave visibility requirement",
      generatedBy: {
        scenario: "requirement_analysis",
        providerId: "human_approval",
        model: "creator_review"
      },
      createdByUserId: "usr_creator"
    }
  });

  await prisma.prdChangeRequest.upsert({
    where: { id: "prdchg_leave_management_001" },
    update: {
      sourceTicketId: "ticket_leave_management_bug_001",
      title: "Add WFH leave visibility requirement",
      proposedRequirement: "WFH leave type must be visible on the mobile request form.",
      affectedSections: ["core_flows", "acceptance_criteria"],
      acceptanceCriteria: ["WFH option appears on mobile", "Manager approval remains unchanged"],
      riskLevel: "medium",
      status: "approved",
      approvedPrdVersionId: "prdver_prj_leave_management_change_01"
    },
    create: {
      id: "prdchg_leave_management_001",
      projectId: "prj_leave_management",
      sourceType: "ticket",
      sourceTicketId: "ticket_leave_management_bug_001",
      title: "Add WFH leave visibility requirement",
      proposedRequirement: "WFH leave type must be visible on the mobile request form.",
      affectedSections: ["core_flows", "acceptance_criteria"],
      acceptanceCriteria: ["WFH option appears on mobile", "Manager approval remains unchanged"],
      riskLevel: "medium",
      status: "approved",
      requestedByUserId: "usr_creator",
      approvedPrdVersionId: "prdver_prj_leave_management_change_01"
    }
  });

  await prisma.prdChangeDecision.upsert({
    where: { id: "prdchgdec_leave_management_001" },
    update: {
      changeRequestId: "prdchg_leave_management_001",
      decision: "approved",
      note: "Approved for MVP Demo Checklist",
      decidedByUserId: "usr_creator",
      decidedAt: new Date("2026-08-18T10:00:00.000Z")
    },
    create: {
      id: "prdchgdec_leave_management_001",
      changeRequestId: "prdchg_leave_management_001",
      decision: "approved",
      note: "Approved for MVP Demo Checklist",
      decidedByUserId: "usr_creator",
      decidedAt: new Date("2026-08-18T10:00:00.000Z")
    }
  });

  await prisma.domainSetting.upsert({
    where: { projectId: "prj_leave_management" },
    update: {
      internalPath: "/apps/leave-management",
      customDomain: null,
      publicDomain: "leave.company.example",
      mode: "public"
    },
    create: {
      id: "domain_leave_management",
      projectId: "prj_leave_management",
      internalPath: "/apps/leave-management",
      customDomain: null,
      publicDomain: "leave.company.example",
      mode: "public"
    }
  });

  await prisma.domainRequest.upsert({
    where: { id: "domainreq_leave_management_public_001" },
    update: {
      domain: "leave.company.example",
      reason: "Pilot group needs a memorable URL",
      intendedAudience: "HR pilot users",
      dataClassification: "internal",
      externalUserPolicy: "approved_users",
      checklistAccepted: true,
      status: "approved",
      requestedByUserId: "usr_creator",
      decidedByUserId: "usr_admin",
      decisionNote: "Approved for private MVP pilot",
      decidedAt: new Date("2026-08-18T10:15:00.000Z")
    },
    create: {
      id: "domainreq_leave_management_public_001",
      projectId: "prj_leave_management",
      domain: "leave.company.example",
      reason: "Pilot group needs a memorable URL",
      intendedAudience: "HR pilot users",
      dataClassification: "internal",
      externalUserPolicy: "approved_users",
      checklistAccepted: true,
      status: "approved",
      requestedByUserId: "usr_creator",
      decidedByUserId: "usr_admin",
      decisionNote: "Approved for private MVP pilot",
      decidedAt: new Date("2026-08-18T10:15:00.000Z")
    }
  });

  await prisma.deploymentTraceRecord.upsert({
    where: { id: "trace_leave_management_mvp_001" },
    update: {
      ticketId: "ticket_leave_management_bug_001",
      prdChangeRequestId: "prdchg_leave_management_001",
      prdVersionId: "prdver_prj_leave_management_change_01",
      frontendCheckpointId: "fechk_leave_management_0001",
      appManifestId: "manifest_app_leave_management_v1",
      deploymentRecordId: "dep_leave_management_001",
      domainSettingId: "domain_leave_management",
      auditEventIds: ["aud_ticket_to_prd", "aud_prd_change_approved", "aud_domain_approved"]
    },
    create: {
      id: "trace_leave_management_mvp_001",
      projectId: "prj_leave_management",
      ticketId: "ticket_leave_management_bug_001",
      prdChangeRequestId: "prdchg_leave_management_001",
      prdVersionId: "prdver_prj_leave_management_change_01",
      frontendCheckpointId: "fechk_leave_management_0001",
      appManifestId: "manifest_app_leave_management_v1",
      deploymentRecordId: "dep_leave_management_001",
      domainSettingId: "domain_leave_management",
      auditEventIds: ["aud_ticket_to_prd", "aud_prd_change_approved", "aud_domain_approved"]
    }
  });

  await seedKeycloakProvider();

  await prisma.authProviderConfig.upsert({
    where: { id: "authprov_oidc_azure_ad_001" },
    update: {
      providerType: "oidc",
      name: "Azure AD Production",
      status: "ready",
      issuerUrl: "https://login.microsoftonline.com/company/v2.0",
      clientId: "evcp-platform",
      clientSecretFingerprint: "fp_oidc_sprint9",
      groupRoleMapping: {
        "evcp-admins": ["admin"],
        "hr-creators": ["creator"]
      }
    },
    create: {
      id: "authprov_oidc_azure_ad_001",
      providerType: "oidc",
      name: "Azure AD Production",
      status: "ready",
      issuerUrl: "https://login.microsoftonline.com/company/v2.0",
      clientId: "evcp-platform",
      clientSecretFingerprint: "fp_oidc_sprint9",
      scopes: ["openid", "profile", "email"],
      groupRoleMapping: {
        "evcp-admins": ["admin"],
        "hr-creators": ["creator"]
      },
      createdByUserId: "usr_admin"
    }
  });

  await prisma.authProviderConfig.upsert({
    where: { id: "authprov_saml_okta_001" },
    update: {
      providerType: "saml",
      name: "Okta Workforce",
      status: "ready",
      entityId: "http://www.okta.com/company",
      ssoUrl: "https://company.okta.com/app/sso/saml",
      certificateFingerprint: "fp_saml_sprint9",
      groupRoleMapping: {
        "IT Admins": ["admin"],
        "HR Creators": ["creator"]
      }
    },
    create: {
      id: "authprov_saml_okta_001",
      providerType: "saml",
      name: "Okta Workforce",
      status: "ready",
      entityId: "http://www.okta.com/company",
      ssoUrl: "https://company.okta.com/app/sso/saml",
      certificateFingerprint: "fp_saml_sprint9",
      scopes: [],
      groupRoleMapping: {
        "IT Admins": ["admin"],
        "HR Creators": ["creator"]
      },
      createdByUserId: "usr_admin"
    }
  });

  await prisma.platformAuthSession.upsert({
    where: { id: "psess_sprint9_oidc_001" },
    update: {
      providerConfigId: "authprov_oidc_azure_ad_001",
      userId: "usr_creator",
      sessionTokenHash: "hash_psess_sprint9_oidc_001",
      claims: {
        subject: "oidc-user-001",
        email: "pilot.creator@company.com",
        name: "Pilot Creator",
        groups: ["hr-creators"],
        platformRoles: ["creator"],
        appRoles: { "leave-management": ["Employee", "Manager"] }
      },
      expiresAt: new Date("2026-09-07T10:00:00.000Z")
    },
    create: {
      id: "psess_sprint9_oidc_001",
      providerConfigId: "authprov_oidc_azure_ad_001",
      userId: "usr_creator",
      sessionTokenHash: "hash_psess_sprint9_oidc_001",
      claims: {
        subject: "oidc-user-001",
        email: "pilot.creator@company.com",
        name: "Pilot Creator",
        groups: ["hr-creators"],
        platformRoles: ["creator"],
        appRoles: { "leave-management": ["Employee", "Manager"] }
      },
      issuedAt: new Date("2026-09-07T09:00:00.000Z"),
      expiresAt: new Date("2026-09-07T10:00:00.000Z")
    }
  });

  await prisma.breakGlassSession.upsert({
    where: { id: "breakglass_sprint9_001" },
    update: {
      userId: "usr_admin",
      reason: "Primary IdP outage during pilot",
      ticketRef: "INC-1001",
      sessionTokenHash: "hash_breakglass_sprint9_001",
      ttlMinutes: 15,
      expiresAt: new Date("2026-09-07T09:15:00.000Z")
    },
    create: {
      id: "breakglass_sprint9_001",
      userId: "usr_admin",
      reason: "Primary IdP outage during pilot",
      ticketRef: "INC-1001",
      sessionTokenHash: "hash_breakglass_sprint9_001",
      ttlMinutes: 15,
      issuedAt: new Date("2026-09-07T09:00:00.000Z"),
      expiresAt: new Date("2026-09-07T09:15:00.000Z")
    }
  });

  const policyTemplates = [
    {
      id: "policy_public_default",
      classification: "public",
      label: "Public",
      requiredReviewers: [],
      requiredChecks: ["auth_session_required"],
      publishAllowed: true,
      externalExposureAllowed: true,
      createdByUserId: "usr_admin"
    },
    {
      id: "policy_internal_default",
      classification: "internal",
      label: "Internal",
      requiredReviewers: ["Project Owner"],
      requiredChecks: ["auth_session_required", "app_role_required"],
      publishAllowed: true,
      externalExposureAllowed: true,
      createdByUserId: "usr_admin"
    },
    {
      id: "policy_confidential_default",
      classification: "confidential",
      label: "Confidential",
      requiredReviewers: ["Project Owner", "Security Admin"],
      requiredChecks: ["auth_session_required", "app_role_required", "audit_high_severity"],
      publishAllowed: true,
      externalExposureAllowed: false,
      createdByUserId: "usr_admin"
    },
    {
      id: "policy_restricted_default",
      classification: "restricted",
      label: "Restricted",
      requiredReviewers: ["Project Owner", "Security Admin", "Platform Admin"],
      requiredChecks: [
        "auth_session_required",
        "app_role_required",
        "audit_high_severity",
        "break_glass_disabled"
      ],
      publishAllowed: false,
      externalExposureAllowed: false,
      createdByUserId: "usr_admin"
    }
  ];

  for (const policyTemplate of policyTemplates) {
    await prisma.policyTemplate.upsert({
      where: { id: policyTemplate.id },
      update: policyTemplate,
      create: policyTemplate
    });
  }

  await prisma.knowledgeSource.upsert({
    where: { id: "knsrc_leave_policy_001" },
    update: {
      title: "HR Leave Policy Handbook",
      sourceType: "markdown",
      ownerUserId: "usr_admin",
      scopeType: "project",
      scopeValue: {
        visibility: "project",
        department: "HR Department",
        projectIds: ["prj_leave_management"],
        appIds: ["app_leave_management"],
        agentRoles: ["frontend_developer"],
        scenarios: ["frontend_coding"]
      },
      projectId: "prj_leave_management",
      appId: "app_leave_management",
      department: "HR Department",
      agentRole: "frontend_developer",
      scenarios: ["frontend_coding"],
      uploadStatus: "uploaded",
      indexStatus: "indexed",
      status: "active",
      tags: ["leave", "policy", "sprint11"]
    },
    create: {
      id: "knsrc_leave_policy_001",
      title: "HR Leave Policy Handbook",
      sourceType: "markdown",
      ownerUserId: "usr_admin",
      scopeType: "project",
      scopeValue: {
        visibility: "project",
        department: "HR Department",
        projectIds: ["prj_leave_management"],
        appIds: ["app_leave_management"],
        agentRoles: ["frontend_developer"],
        scenarios: ["frontend_coding"]
      },
      projectId: "prj_leave_management",
      appId: "app_leave_management",
      department: "HR Department",
      agentRole: "frontend_developer",
      scenarios: ["frontend_coding"],
      uploadStatus: "uploaded",
      indexStatus: "indexed",
      status: "active",
      tags: ["leave", "policy", "sprint11"]
    }
  });

  await prisma.knowledgeVersion.upsert({
    where: { id: "knver_leave_policy_v1" },
    update: {
      contentHash: "sha256:seed-leave-policy-v1",
      changelog: "Initial approved HR leave policy for governed workspace prompts.",
      chunkCount: 2,
      excerpts: ["WFH leave requires manager approval.", "HR admins can review policy exceptions."],
      approvalStatus: "approved",
      lifecycleStatus: "active",
      isActive: true,
      approvedByUserId: "usr_admin",
      approvedAt: new Date("2026-09-08T09:00:00.000Z")
    },
    create: {
      id: "knver_leave_policy_v1",
      sourceId: "knsrc_leave_policy_001",
      version: "v1",
      contentHash: "sha256:seed-leave-policy-v1",
      changelog: "Initial approved HR leave policy for governed workspace prompts.",
      chunkCount: 2,
      excerpts: ["WFH leave requires manager approval.", "HR admins can review policy exceptions."],
      approvalStatus: "approved",
      lifecycleStatus: "active",
      isActive: true,
      approvedByUserId: "usr_admin",
      approvedAt: new Date("2026-09-08T09:00:00.000Z"),
      createdByUserId: "usr_admin"
    }
  });

  await prisma.knowledgeApproval.upsert({
    where: { id: "knapp_leave_policy_v1" },
    update: {
      decision: "approved",
      note: "Approved as Sprint 11 governed knowledge fixture.",
      decidedByUserId: "usr_admin"
    },
    create: {
      id: "knapp_leave_policy_v1",
      sourceId: "knsrc_leave_policy_001",
      versionId: "knver_leave_policy_v1",
      decision: "approved",
      note: "Approved as Sprint 11 governed knowledge fixture.",
      decidedByUserId: "usr_admin",
      decidedAt: new Date("2026-09-08T09:01:00.000Z")
    }
  });

  await prisma.knowledgeIndexChunk.upsert({
    where: {
      versionId_chunkKey: { versionId: "knver_leave_policy_v1", chunkKey: "leave-policy-001" }
    },
    update: {
      heading: "WFH Leave Approval",
      excerpt: "WFH leave requires manager approval and HR visibility.",
      tokens: 32,
      status: "indexed"
    },
    create: {
      id: "knchunk_leave_policy_001",
      versionId: "knver_leave_policy_v1",
      chunkKey: "leave-policy-001",
      heading: "WFH Leave Approval",
      excerpt: "WFH leave requires manager approval and HR visibility.",
      tokens: 32,
      embeddingRef: "mock-embedding:leave-policy-001",
      status: "indexed"
    }
  });

  await prisma.knowledgeRetrievalLog.upsert({
    where: { id: "knret_leave_policy_001" },
    update: {
      matchedVersionIds: ["knver_leave_policy_v1"],
      deniedVersionIds: [],
      retrievalContext: {
        query: "Add WFH leave type",
        requiredKnowledgeSourceIds: ["knsrc_leave_policy_001"]
      }
    },
    create: {
      id: "knret_leave_policy_001",
      actorUserId: "usr_creator",
      projectId: "prj_leave_management",
      appId: "app_leave_management",
      department: "HR Department",
      scenario: "frontend_coding",
      agentRole: "frontend_developer",
      matchedVersionIds: ["knver_leave_policy_v1"],
      deniedVersionIds: [],
      retrievalContext: {
        query: "Add WFH leave type",
        requiredKnowledgeSourceIds: ["knsrc_leave_policy_001"]
      }
    }
  });

  await seedDemoLeaveSkill();

  await prisma.installerReport.upsert({
    where: { id: "instrep_private_server_ready" },
    update: {
      status: "passed",
      installBlocked: false,
      reportPath: "reports/install/private-server-install-report.json",
      checks: [
        { name: "CPU", required: ">= 4 cores", observed: "8 cores", status: "pass", action: "-" },
        { name: "RAM", required: ">= 8 GB", observed: "32 GB", status: "pass", action: "-" },
        {
          name: "Disk",
          required: ">= 100 GB free",
          observed: "500 GB",
          status: "pass",
          action: "-"
        },
        {
          name: "Docker",
          required: "Docker installed",
          observed: "26.1.0",
          status: "pass",
          action: "-"
        }
      ],
      actionableFailures: [],
      composeServices: [
        { name: "platform-api", status: "healthy", endpoint: "platform-api" },
        { name: "admin-web", status: "healthy", endpoint: "admin-web" },
        { name: "creator-web", status: "healthy", endpoint: "creator-web" },
        { name: "app-store-pwa", status: "healthy", endpoint: "app-store-pwa" },
        { name: "postgres", status: "healthy", endpoint: "postgres" },
        { name: "keycloak", status: "healthy", endpoint: "keycloak" },
        { name: "minio", status: "healthy", endpoint: "minio" },
        { name: "redis", status: "healthy", endpoint: "redis" },
        { name: "caddy", status: "healthy", endpoint: ":443" }
      ],
      createdByUserId: "usr_admin"
    },
    create: {
      id: "instrep_private_server_ready",
      status: "passed",
      installBlocked: false,
      reportPath: "reports/install/private-server-install-report.json",
      checks: [
        { name: "CPU", required: ">= 4 cores", observed: "8 cores", status: "pass", action: "-" },
        { name: "RAM", required: ">= 8 GB", observed: "32 GB", status: "pass", action: "-" },
        {
          name: "Disk",
          required: ">= 100 GB free",
          observed: "500 GB",
          status: "pass",
          action: "-"
        },
        {
          name: "Docker",
          required: "Docker installed",
          observed: "26.1.0",
          status: "pass",
          action: "-"
        }
      ],
      actionableFailures: [],
      composeServices: [
        { name: "platform-api", status: "healthy", endpoint: "platform-api" },
        { name: "admin-web", status: "healthy", endpoint: "admin-web" },
        { name: "creator-web", status: "healthy", endpoint: "creator-web" },
        { name: "app-store-pwa", status: "healthy", endpoint: "app-store-pwa" },
        { name: "postgres", status: "healthy", endpoint: "postgres" },
        { name: "keycloak", status: "healthy", endpoint: "keycloak" },
        { name: "minio", status: "healthy", endpoint: "minio" },
        { name: "redis", status: "healthy", endpoint: "redis" },
        { name: "caddy", status: "healthy", endpoint: ":443" }
      ],
      createdByUserId: "usr_admin"
    }
  });

  await prisma.setupConfiguration.upsert({
    where: { id: "setup_private_server_001" },
    update: {
      status: "completed",
      domain: "platform.company.test",
      databaseUrlMasked: "postgresql://evcp:***@postgres:5432/evcp",
      storageConfig: { provider: "minio", endpoint: "http://minio:9000", bucket: "evcp-backups" },
      authConfig: { mode: "keycloak", issuerUrl: "http://keycloak:8080/realms/evcp" },
      aiConfig: { providerId: "aip_openai_production", model: "gpt-4.1" },
      guardrailConfig: { defaultPolicy: "enterprise-default", blockHighRisk: true },
      backupConfig: {
        schedule: "0 2 * * *",
        retentionDays: 30,
        encryptionMode: "kms",
        encryptionKeyRef: "kms://evcp/backup"
      },
      firstAdminConfig: { email: "admin@company.com", displayName: "Platform Admin" },
      createdByUserId: "usr_admin"
    },
    create: {
      id: "setup_private_server_001",
      status: "completed",
      domain: "platform.company.test",
      databaseUrlMasked: "postgresql://evcp:***@postgres:5432/evcp",
      storageConfig: { provider: "minio", endpoint: "http://minio:9000", bucket: "evcp-backups" },
      authConfig: { mode: "keycloak", issuerUrl: "http://keycloak:8080/realms/evcp" },
      aiConfig: { providerId: "aip_openai_production", model: "gpt-4.1" },
      guardrailConfig: { defaultPolicy: "enterprise-default", blockHighRisk: true },
      backupConfig: {
        schedule: "0 2 * * *",
        retentionDays: 30,
        encryptionMode: "kms",
        encryptionKeyRef: "kms://evcp/backup"
      },
      firstAdminConfig: { email: "admin@company.com", displayName: "Platform Admin" },
      createdByUserId: "usr_admin"
    }
  });

  await prisma.backupPolicy.upsert({
    where: { id: "bckpol_nightly_postgres" },
    update: {
      name: "Nightly PostgreSQL Backup",
      schedule: "0 2 * * *",
      retentionDays: 30,
      storageProvider: "minio",
      storageConfig: { provider: "minio", endpoint: "http://minio:9000", bucket: "evcp-backups" },
      encryptionMode: "kms",
      encryptionKeyRef: "kms://evcp/backup",
      enabled: true,
      status: "active",
      createdByUserId: "usr_admin"
    },
    create: {
      id: "bckpol_nightly_postgres",
      name: "Nightly PostgreSQL Backup",
      schedule: "0 2 * * *",
      retentionDays: 30,
      storageProvider: "minio",
      storageConfig: { provider: "minio", endpoint: "http://minio:9000", bucket: "evcp-backups" },
      encryptionMode: "kms",
      encryptionKeyRef: "kms://evcp/backup",
      enabled: true,
      status: "active",
      createdByUserId: "usr_admin"
    }
  });

  await prisma.backupRun.upsert({
    where: { id: "bckrun_nightly_postgres_001" },
    update: {
      policyId: "bckpol_nightly_postgres",
      trigger: "scheduled",
      databaseName: "evcp",
      status: "succeeded",
      encrypted: true,
      artifactUri: "minio://evcp-backups/bckrun_nightly_postgres_001/evcp.dump.enc",
      checksum: "sha256:seed-backup-run-001",
      sizeBytes: BigInt("2415919104"),
      startedAt: new Date("2026-09-15T02:00:00.000Z"),
      finishedAt: new Date("2026-09-15T02:05:00.000Z"),
      createdByUserId: "usr_admin"
    },
    create: {
      id: "bckrun_nightly_postgres_001",
      policyId: "bckpol_nightly_postgres",
      trigger: "scheduled",
      databaseName: "evcp",
      status: "succeeded",
      encrypted: true,
      artifactUri: "minio://evcp-backups/bckrun_nightly_postgres_001/evcp.dump.enc",
      checksum: "sha256:seed-backup-run-001",
      sizeBytes: BigInt("2415919104"),
      startedAt: new Date("2026-09-15T02:00:00.000Z"),
      finishedAt: new Date("2026-09-15T02:05:00.000Z"),
      createdByUserId: "usr_admin"
    }
  });

  await prisma.pitrConfiguration.upsert({
    where: { id: "pitr_evcp_ready_001" },
    update: {
      databaseName: "evcp",
      walRetentionHours: 72,
      baseBackupRunId: "bckrun_nightly_postgres_001",
      targetTimestamp: new Date("2026-09-15T02:03:00.000Z"),
      rpoMinutes: 60,
      rtoMinutes: 120,
      status: "ready",
      createdByUserId: "usr_admin"
    },
    create: {
      id: "pitr_evcp_ready_001",
      databaseName: "evcp",
      walRetentionHours: 72,
      baseBackupRunId: "bckrun_nightly_postgres_001",
      targetTimestamp: new Date("2026-09-15T02:03:00.000Z"),
      rpoMinutes: 60,
      rtoMinutes: 120,
      status: "ready",
      createdByUserId: "usr_admin"
    }
  });

  await prisma.restoreDrillReport.upsert({
    where: { id: "restore_drill_001" },
    update: {
      backupRunId: "bckrun_nightly_postgres_001",
      pitrConfigId: "pitr_evcp_ready_001",
      targetTimestamp: new Date("2026-09-15T02:03:00.000Z"),
      validationChecks: ["checksum", "schema", "seed-records", "audit-events"],
      failedChecks: [],
      status: "passed",
      recoveryVerified: true,
      reportPath: "reports/restore/passed-restore-drill-report.json",
      createdByUserId: "usr_admin"
    },
    create: {
      id: "restore_drill_001",
      backupRunId: "bckrun_nightly_postgres_001",
      pitrConfigId: "pitr_evcp_ready_001",
      targetTimestamp: new Date("2026-09-15T02:03:00.000Z"),
      validationChecks: ["checksum", "schema", "seed-records", "audit-events"],
      failedChecks: [],
      status: "passed",
      recoveryVerified: true,
      reportPath: "reports/restore/passed-restore-drill-report.json",
      createdByUserId: "usr_admin"
    }
  });

  await prisma.serviceHealthSnapshot.upsert({
    where: { id: "svc_health_platform_api" },
    update: {
      serviceName: "Platform API",
      serviceType: "platform",
      status: "healthy",
      p95LatencyMs: 42,
      queueDepth: 0,
      errorRate: 0,
      auditRetentionDays: 365,
      signal: { healthEndpoint: "/health", logs: "structured", owner: "IT Admin" },
      createdByUserId: "usr_admin"
    },
    create: {
      id: "svc_health_platform_api",
      serviceName: "Platform API",
      serviceType: "platform",
      status: "healthy",
      p95LatencyMs: 42,
      queueDepth: 0,
      errorRate: 0,
      auditRetentionDays: 365,
      signal: { healthEndpoint: "/health", logs: "structured", owner: "IT Admin" },
      createdByUserId: "usr_admin",
      capturedAt: new Date("2026-10-05T08:00:00.000Z")
    }
  });

  await prisma.telemetryExportConfig.upsert({
    where: { id: "telemetry_otlp_default" },
    update: {
      name: "Default OTLP Export",
      endpoint: "otlp://observability.company.test:4317",
      protocol: "otlp",
      signals: ["metrics", "logs", "traces", "alerts"],
      status: "configured",
      auditRetentionDays: 365,
      createdByUserId: "usr_admin"
    },
    create: {
      id: "telemetry_otlp_default",
      name: "Default OTLP Export",
      endpoint: "otlp://observability.company.test:4317",
      protocol: "otlp",
      signals: ["metrics", "logs", "traces", "alerts"],
      status: "configured",
      auditRetentionDays: 365,
      createdByUserId: "usr_admin"
    }
  });

  await prisma.upgradeCompatibilityReport.upsert({
    where: { id: "upgrade_check_001" },
    update: {
      sourceVersion: "1.0.0",
      targetVersion: "1.1.0",
      status: "blocked",
      upgradeBlocked: true,
      checks: [
        { name: "Disk space", passed: false, observed: "20GB", required: ">=100GB" },
        { name: "Last backup", passed: false, observed: "failed", required: "succeeded" },
        {
          name: "License status",
          passed: false,
          observed: "expired",
          required: "active or warning"
        }
      ],
      blockingReasons: ["Disk space below minimum", "Last backup failed", "License is expired"],
      createdByUserId: "usr_admin"
    },
    create: {
      id: "upgrade_check_001",
      sourceVersion: "1.0.0",
      targetVersion: "1.1.0",
      status: "blocked",
      upgradeBlocked: true,
      checks: [
        { name: "Disk space", passed: false, observed: "20GB", required: ">=100GB" },
        { name: "Last backup", passed: false, observed: "failed", required: "succeeded" },
        {
          name: "License status",
          passed: false,
          observed: "expired",
          required: "active or warning"
        }
      ],
      blockingReasons: ["Disk space below minimum", "Last backup failed", "License is expired"],
      createdByUserId: "usr_admin",
      createdAt: new Date("2026-10-05T08:10:00.000Z")
    }
  });

  await prisma.rollbackReport.upsert({
    where: { id: "rollback_report_001" },
    update: {
      fromVersion: "1.1.1",
      toVersion: "1.1.0",
      status: "succeeded",
      reason: "Upgrade health check failed",
      rollbackWindowEndsAt: new Date("2026-10-05T12:00:00.000Z"),
      reportPath: "reports/rollback/rollback_report_001.json",
      createdByUserId: "usr_admin"
    },
    create: {
      id: "rollback_report_001",
      fromVersion: "1.1.1",
      toVersion: "1.1.0",
      status: "succeeded",
      reason: "Upgrade health check failed",
      rollbackWindowEndsAt: new Date("2026-10-05T12:00:00.000Z"),
      reportPath: "reports/rollback/rollback_report_001.json",
      createdByUserId: "usr_admin",
      createdAt: new Date("2026-10-05T08:20:00.000Z")
    }
  });

  await prisma.licenseRecord.upsert({
    where: { id: "license_enterprise_2026" },
    update: {
      licenseKeyFingerprint: "sha256:license-key-enterprise-2026",
      signedPayloadFingerprint: "sha256:signed-payload-enterprise-2026",
      issuer: "0xlabs",
      subject: "company-private-server",
      edition: "enterprise",
      seatLimit: 100,
      appLimit: 25,
      aiUsageMonthlyTokens: 1000000,
      expiresAt: new Date("2026-12-31T23:59:59.000Z"),
      warningStartsAt: new Date("2026-12-01T23:59:59.000Z"),
      graceEndsAt: new Date("2027-01-14T23:59:59.000Z"),
      offlineValidUntil: new Date("2027-01-14T23:59:59.000Z"),
      status: "active",
      restrictedActions: [],
      createdByUserId: "usr_admin"
    },
    create: {
      id: "license_enterprise_2026",
      licenseKeyFingerprint: "sha256:license-key-enterprise-2026",
      signedPayloadFingerprint: "sha256:signed-payload-enterprise-2026",
      issuer: "0xlabs",
      subject: "company-private-server",
      edition: "enterprise",
      seatLimit: 100,
      appLimit: 25,
      aiUsageMonthlyTokens: 1000000,
      expiresAt: new Date("2026-12-31T23:59:59.000Z"),
      warningStartsAt: new Date("2026-12-01T23:59:59.000Z"),
      graceEndsAt: new Date("2027-01-14T23:59:59.000Z"),
      offlineValidUntil: new Date("2027-01-14T23:59:59.000Z"),
      status: "active",
      restrictedActions: [],
      createdByUserId: "usr_admin",
      createdAt: new Date("2026-10-05T08:30:00.000Z")
    }
  });

  await prisma.licenseValidationLog.upsert({
    where: { id: "license_validation_offline_001" },
    update: {
      licenseId: "license_enterprise_2026",
      source: "offline_cache",
      status: "active",
      offlineCacheUsed: true,
      offlineValidUntil: new Date("2027-01-14T23:59:59.000Z"),
      checkedAt: new Date("2026-10-05T08:35:00.000Z"),
      createdByUserId: "usr_admin"
    },
    create: {
      id: "license_validation_offline_001",
      licenseId: "license_enterprise_2026",
      source: "offline_cache",
      status: "active",
      offlineCacheUsed: true,
      offlineValidUntil: new Date("2027-01-14T23:59:59.000Z"),
      checkedAt: new Date("2026-10-05T08:35:00.000Z"),
      createdByUserId: "usr_admin"
    }
  });

  await prisma.licenseEnforcementEvent.upsert({
    where: { id: "license_enforcement_publish_block_001" },
    update: {
      licenseId: "license_enterprise_2026",
      actorUserId: "usr_creator",
      action: "publish",
      allowed: false,
      status: "expired",
      reasons: ["License expired beyond grace period", "Existing app data must be preserved"],
      restrictedActions: [
        "publish",
        "ai_generation",
        "new_app",
        "new_external_invite",
        "activate_user"
      ],
      preserveExistingData: true,
      checkedAt: new Date("2027-02-01T00:00:00.000Z")
    },
    create: {
      id: "license_enforcement_publish_block_001",
      licenseId: "license_enterprise_2026",
      actorUserId: "usr_creator",
      action: "publish",
      allowed: false,
      status: "expired",
      reasons: ["License expired beyond grace period", "Existing app data must be preserved"],
      restrictedActions: [
        "publish",
        "ai_generation",
        "new_app",
        "new_external_invite",
        "activate_user"
      ],
      preserveExistingData: true,
      checkedAt: new Date("2027-02-01T00:00:00.000Z")
    }
  });

  await prisma.securityReadinessReport.upsert({
    where: { id: "sec_readiness_release_001" },
    update: {
      status: "blocked",
      tlsEnforced: true,
      sessionPolicy: {
        idleTimeoutMinutes: 30,
        absoluteTimeoutMinutes: 480,
        rememberMeAllowed: false
      },
      secretRedactionPassed: true,
      uploadPolicy: {
        allowedMimeTypes: ["application/pdf", "text/markdown"],
        maxSizeBytes: 10000000,
        quarantineOnPending: true
      },
      releaseChecklist: {
        requiredChecks: ["auth", "permissions", "domain", "tls", "data_classification", "audit"]
      },
      rtmRegression: { p0RequirementsTotal: 42, p0RequirementsPassed: 42, exceptionsApproved: 0 },
      createdByUserId: "usr_admin"
    },
    create: {
      id: "sec_readiness_release_001",
      status: "blocked",
      tlsEnforced: true,
      sessionPolicy: {
        idleTimeoutMinutes: 30,
        absoluteTimeoutMinutes: 480,
        rememberMeAllowed: false
      },
      secretRedactionPassed: true,
      uploadPolicy: {
        allowedMimeTypes: ["application/pdf", "text/markdown"],
        maxSizeBytes: 10000000,
        quarantineOnPending: true
      },
      releaseChecklist: {
        requiredChecks: ["auth", "permissions", "domain", "tls", "data_classification", "audit"]
      },
      rtmRegression: { p0RequirementsTotal: 42, p0RequirementsPassed: 42, exceptionsApproved: 0 },
      createdByUserId: "usr_admin",
      createdAt: new Date("2026-10-10T08:00:00.000Z")
    }
  });

  await prisma.securityReadinessCheck.upsert({
    where: { id: "sec_check_tls_001" },
    update: {
      reportId: "sec_readiness_release_001",
      category: "transport",
      name: "TLS Enforcement",
      required: "HTTPS in production",
      observed: "production HTTPS required; local setup HTTP allowed",
      status: "pass",
      action: "-",
      createdByUserId: "usr_admin"
    },
    create: {
      id: "sec_check_tls_001",
      reportId: "sec_readiness_release_001",
      category: "transport",
      name: "TLS Enforcement",
      required: "HTTPS in production",
      observed: "production HTTPS required; local setup HTTP allowed",
      status: "pass",
      action: "-",
      createdByUserId: "usr_admin",
      createdAt: new Date("2026-10-10T08:01:00.000Z")
    }
  });

  await prisma.uploadScanEvent.upsert({
    where: { id: "upload_scan_quarantine_001" },
    update: {
      fileName: "pending.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      sizeBytes: BigInt(1000000),
      source: "ticket",
      scanStatus: "pending",
      decision: "quarantined",
      quarantineReason: "malware scan pending; file quarantined before ingestion",
      reasons: ["malware scan pending; file quarantined before ingestion"],
      createdByUserId: "usr_admin"
    },
    create: {
      id: "upload_scan_quarantine_001",
      fileName: "pending.docx",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      sizeBytes: BigInt(1000000),
      source: "ticket",
      scanStatus: "pending",
      decision: "quarantined",
      quarantineReason: "malware scan pending; file quarantined before ingestion",
      reasons: ["malware scan pending; file quarantined before ingestion"],
      createdByUserId: "usr_admin",
      createdAt: new Date("2026-10-10T08:02:00.000Z")
    }
  });

  await prisma.releaseChecklistReport.upsert({
    where: { id: "release_check_public_block_001" },
    update: {
      projectId: "prj_leave_management",
      exposure: "public",
      releaseBlocked: true,
      requiredChecks: [
        { name: "TLS", status: "fail", action: "TLS is required before public exposure" },
        {
          name: "Data Classification",
          status: "fail",
          action: "Confidential data cannot be public"
        }
      ],
      blockingReasons: [
        "TLS is required before public exposure",
        "Confidential data cannot be public"
      ],
      dataClassification: "Confidential",
      createdByUserId: "usr_admin"
    },
    create: {
      id: "release_check_public_block_001",
      projectId: "prj_leave_management",
      exposure: "public",
      releaseBlocked: true,
      requiredChecks: [
        { name: "TLS", status: "fail", action: "TLS is required before public exposure" },
        {
          name: "Data Classification",
          status: "fail",
          action: "Confidential data cannot be public"
        }
      ],
      blockingReasons: [
        "TLS is required before public exposure",
        "Confidential data cannot be public"
      ],
      dataClassification: "Confidential",
      createdByUserId: "usr_admin",
      createdAt: new Date("2026-10-10T08:03:00.000Z")
    }
  });

  await prisma.sensitiveRedactionEvidence.upsert({
    where: { id: "redaction_evidence_restricted_001" },
    update: {
      classification: "Restricted",
      surface: "prompt_ticket_request",
      redactionRulesApplied: [
        "secret_key",
        "password",
        "payment_card",
        "national_id",
        "sensitive_request_key"
      ],
      redactedPayload: {
        prompt: "Summarize payroll export using [REDACTED_SECRET_KEY]",
        ticketDescription: "password [REDACTED] and card [REDACTED_PAYMENT_CARD]",
        requestPayload: { apiKey: "[REDACTED_SECRET]", normalField: "leave request" }
      },
      createdByUserId: "usr_admin"
    },
    create: {
      id: "redaction_evidence_restricted_001",
      classification: "Restricted",
      surface: "prompt_ticket_request",
      redactionRulesApplied: [
        "secret_key",
        "password",
        "payment_card",
        "national_id",
        "sensitive_request_key"
      ],
      redactedPayload: {
        prompt: "Summarize payroll export using [REDACTED_SECRET_KEY]",
        ticketDescription: "password [REDACTED] and card [REDACTED_PAYMENT_CARD]",
        requestPayload: { apiKey: "[REDACTED_SECRET]", normalField: "leave request" }
      },
      createdByUserId: "usr_admin",
      createdAt: new Date("2026-10-10T08:04:00.000Z")
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
