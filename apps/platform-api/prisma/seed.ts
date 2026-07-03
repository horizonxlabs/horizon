import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const roles = [
  { id: "role_admin", key: "admin", name: "Platform Admin", permissions: ["platform:admin", "ai:manage", "guardrail:manage", "audit:view"] },
  { id: "role_creator", key: "creator", name: "Creator", permissions: ["project:create", "project:update", "app:publish-request", "ticket:manage"] },
  { id: "role_end_user", key: "end_user", name: "End User", permissions: ["store:view", "ticket:create", "access:request"] }
];

const users = [
  { id: "usr_admin", email: "admin@company.com", name: "Admin User", roleId: "role_admin" },
  { id: "usr_creator", email: "creator@company.com", name: "Creator User", roleId: "role_creator" },
  { id: "usr_end_user", email: "user@company.com", name: "End User", roleId: "role_end_user" }
];

async function main() {
  for (const role of roles) {
    await prisma.platformRole.upsert({
      where: { key: role.key },
      update: { name: role.name, permissions: role.permissions },
      create: role
    });
  }

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
    where: { slug: "leave-management" },
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
      slug: "leave-management",
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
    where: { slug: "leave-management" },
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

  await prisma.aiScenarioRoute.upsert({
    where: { scenario: "prd_generation" },
    update: {
      primaryProviderId: "aip_openai_production",
      primaryModel: "gpt-4.1",
      fallbackProviderId: null,
      fallbackModel: null
    },
    create: {
      id: "air_prd_generation",
      scenario: "prd_generation",
      primaryProviderId: "aip_openai_production",
      primaryModel: "gpt-4.1"
    }
  });

  await prisma.aiScenarioRoute.upsert({
    where: { scenario: "frontend_coding" },
    update: {
      primaryProviderId: "aip_openai_production",
      primaryModel: "gpt-4.1",
      fallbackProviderId: null,
      fallbackModel: null
    },
    create: {
      id: "air_frontend_coding",
      scenario: "frontend_coding",
      primaryProviderId: "aip_openai_production",
      primaryModel: "gpt-4.1"
    }
  });

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
      generatedBy: { scenario: "prd_generation", providerId: "aip_openai_production", model: "gpt-4.1" },
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
      generatedBy: { scenario: "prd_generation", providerId: "aip_openai_production", model: "gpt-4.1" },
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
      generatedBy: { scenario: "prd_generation", providerId: "aip_openai_production", model: "gpt-4.1" },
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
      generatedBy: { scenario: "prd_generation", providerId: "aip_openai_production", model: "gpt-4.1" },
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
    ["business_objective", "Business Objective", "Employees need self-service leave requests with manager approval."],
    ["users_roles", "Users and Roles", "Primary users are Employee, Manager and HR Admin."],
    ["core_flows", "Core Flows", "Create request, manager review, HR visibility and status tracking."],
    ["data_model", "Data Model", "Employee, leave request, approval step, notification and audit event."],
    ["acceptance_criteria", "Acceptance Criteria", "Creator can generate, review and confirm Baseline v1.0 before app generation."]
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
    update: { data: { id: "lr_1001", employee_id: "emp_001", leave_type: "WFH", status: "pending" } },
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
    update: { data: { id: "lr_1002", employee_id: "emp_002", leave_type: "annual", status: "approved" } },
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
    where: { projectId_migrationId: { projectId: "prj_leave_management", migrationId: "2026081001_leave_management_base" } },
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
