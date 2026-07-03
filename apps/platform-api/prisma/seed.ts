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
      databaseSnapshot: { schemaName: "app_leave_management", tables: ["employees", "leave_requests", "approval_steps"] },
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
      databaseSnapshot: { schemaName: "app_leave_management", tables: ["employees", "leave_requests", "approval_steps"] },
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

  const mvpDemoChecklist = [
    "Admin configures AI provider, quota and guardrail",
    "Creator creates Leave Management and confirms PRD baseline",
    "Creator prompts WFH leave change and publishes",
    "End User submits ticket TKT-0001",
    "Creator converts ticket to PRD change",
    "Creator approves PRD change and reviews traceability",
    "Admin approves public domain request",
    "Admin reviews MVP Monitoring and Audit Filters"
  ];

  await prisma.prdVersion.upsert({
    where: { id: "prdver_prj_leave_management_change_01" },
    update: {
      status: "baseline",
      isBaseline: false,
      sourcePrompt: "Approved PRD change prdchg_leave_management_001",
      changeSummary: "Add WFH leave visibility requirement",
      generatedBy: { scenario: "requirement_analysis", providerId: "human_approval", model: "creator_review" },
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
      generatedBy: { scenario: "requirement_analysis", providerId: "human_approval", model: "creator_review" },
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

  await prisma.authProviderConfig.upsert({
    where: { id: "authprov_keycloak_default_001" },
    update: {
      providerType: "keycloak",
      name: "Bundled Keycloak Default",
      status: "active",
      issuerUrl: "http://keycloak:8080/realms/evcp",
      groupRoleMapping: {
        "evcp-admins": ["admin"],
        "evcp-creators": ["creator"],
        "evcp-users": ["end_user"]
      }
    },
    create: {
      id: "authprov_keycloak_default_001",
      providerType: "keycloak",
      name: "Bundled Keycloak Default",
      status: "active",
      issuerUrl: "http://keycloak:8080/realms/evcp",
      scopes: ["openid", "profile", "email"],
      groupRoleMapping: {
        "evcp-admins": ["admin"],
        "evcp-creators": ["creator"],
        "evcp-users": ["end_user"]
      },
      createdByUserId: "usr_admin"
    }
  });

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
      requiredChecks: ["auth_session_required", "app_role_required", "audit_high_severity", "break_glass_disabled"],
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
