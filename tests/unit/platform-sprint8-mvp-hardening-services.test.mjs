import test from "node:test";
import assert from "node:assert/strict";

const { createPlatformApiServices } = await import("../../apps/platform-api/src/platform-services.ts");

function createSprint8Fixture() {
  const services = createPlatformApiServices();
  const admin = services.auth.resolveCurrentUser({ "x-mock-user-email": "admin@company.com" });
  const creator = services.auth.resolveCurrentUser({ "x-mock-user-email": "creator@company.com" });
  const endUser = services.auth.resolveCurrentUser({ "x-mock-user-email": "user@company.com" });
  const provider = services.aiGovernance.createProvider(admin, {
    name: "OpenAI Production",
    adapter: "openai",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1"]
  });

  for (const scenario of ["prd_generation", "frontend_coding"]) {
    services.aiGovernance.configureRoute(admin, {
      scenario,
      primaryProviderId: provider.id,
      primaryModel: "gpt-4.1"
    });
  }

  services.aiGovernance.configureQuota(admin, {
    scope: "creator",
    dailyLimit: 1000,
    monthlyLimit: 5000,
    warningThreshold: 800,
    hardStop: true,
    usedToday: 0
  });

  const project = services.projects.createProject({
    actor: creator,
    name: "Leave Management",
    slug: "leave-management-sprint8",
    appType: "Workflow App",
    businessProblem: "Employees need self-service leave requests",
    targetDepartment: "HR Department",
    intendedUsers: ["Employee", "Manager", "HR Admin"],
    dataSensitivity: "internal"
  });
  const draft = services.prds.generateDraft(creator, project.id);
  services.prds.confirmBaseline(creator, project.id, draft.id);
  services.workspace.submitPrompt(creator, project.id, { prompt: "Add WFH leave type" });
  services.publish.publishApp(creator, project.id);
  const ticket = services.tickets.createTicket(endUser, "leave-management-sprint8", {
    type: "bug",
    priority: "high",
    title: "WFH leave type not visible",
    description: "The WFH option disappeared on mobile.",
    deviceInfo: "iPhone 15 Safari"
  });

  return { services, admin, creator, endUser, project, ticket };
}

test("Creator converts ticket to PRD change request and duplicate conversion returns existing link", () => {
  const { services, creator, project, ticket } = createSprint8Fixture();

  const first = services.prdChanges.convertTicketToChange(creator, project.id, {
    ticketId: ticket.id,
    title: "Add WFH leave visibility requirement",
    proposedRequirement: "WFH leave type must be visible on mobile request form.",
    affectedSections: ["core_flows", "acceptance_criteria"],
    acceptanceCriteria: ["WFH option appears on mobile", "Manager approval remains unchanged"],
    riskLevel: "medium"
  });
  const duplicate = services.prdChanges.convertTicketToChange(creator, project.id, {
    ticketId: ticket.id,
    title: "Duplicate WFH requirement",
    proposedRequirement: "Duplicate should not create a second request.",
    affectedSections: ["core_flows"],
    acceptanceCriteria: ["No duplicate"],
    riskLevel: "low"
  });

  assert.equal(first.status, "pending_approval");
  assert.equal(first.sourceType, "ticket");
  assert.equal(first.sourceTicketId, ticket.id);
  assert.deepEqual(first.affectedSections, ["core_flows", "acceptance_criteria"]);
  assert.equal(duplicate.id, first.id);
  assert.equal(services.prdChanges.listChanges(creator, project.id).length, 1);
  assert.ok(services.audit.list().some((event) => event.action === "ticket.converted_to_prd_change" && event.resourceId === ticket.id));
});

test("PRD change approval records decision and creates linked PRD version", () => {
  const { services, creator, project, ticket } = createSprint8Fixture();
  const change = services.prdChanges.convertTicketToChange(creator, project.id, {
    ticketId: ticket.id,
    title: "Add WFH leave visibility requirement",
    proposedRequirement: "WFH leave type must be visible on mobile request form.",
    affectedSections: ["core_flows"],
    acceptanceCriteria: ["WFH option appears on mobile"],
    riskLevel: "medium"
  });

  const approval = services.prdChanges.decideChange(creator, project.id, {
    changeId: change.id,
    decision: "approved",
    note: "Approved for pilot demo",
    approverUserId: creator.id
  });

  assert.equal(approval.change.status, "approved");
  assert.equal(approval.decision.decision, "approved");
  assert.equal(approval.prdVersion.version, "1.1");
  assert.equal(approval.change.approvedPrdVersionId, approval.prdVersion.id);
  assert.ok(services.prds.listVersions(creator, project.id).some((version) => version.id === approval.prdVersion.id));
  assert.ok(services.audit.list().some((event) => event.action === "prd.change.approved" && event.resourceId === change.id));
});

test("PRD change approval records authenticated actor as decision maker", () => {
  const { services, admin, creator, project, ticket } = createSprint8Fixture();
  const change = services.prdChanges.convertTicketToChange(creator, project.id, {
    ticketId: ticket.id,
    title: "Add WFH leave visibility requirement",
    proposedRequirement: "WFH leave type must be visible on mobile request form.",
    affectedSections: ["core_flows"],
    acceptanceCriteria: ["WFH option appears on mobile"],
    riskLevel: "medium"
  });

  const approval = services.prdChanges.decideChange(creator, project.id, {
    changeId: change.id,
    decision: "approved",
    note: "Approved for pilot demo",
    approverUserId: admin.id
  });

  assert.equal(approval.decision.decidedByUserId, creator.id);
});

test("Domain request approval persists domain state and audit trail", () => {
  const { services, admin, creator, project } = createSprint8Fixture();

  const settings = services.domains.getSettings(creator, project.id);
  const request = services.domains.requestPublicDomain(creator, project.id, {
    domain: "leave.company.example",
    reason: "Pilot group needs a memorable URL",
    intendedAudience: "HR pilot users",
    dataClassification: "internal",
    externalUserPolicy: "approved_users",
    checklistAccepted: true
  });
  assert.equal(request.status, "pending_approval");

  const decision = services.domains.decideDomainRequest(admin, request.id, {
    decision: "approved",
    note: "Approved for private pilot"
  });

  assert.equal(settings.internalPath, "/apps/leave-management-sprint8");
  assert.equal(decision.status, "approved");
  assert.equal(services.domains.getSettings(creator, project.id).publicDomain, "leave.company.example");
  assert.ok(services.audit.list().some((event) => event.action === "domain.request.approved" && event.resourceId === request.id));
});

test("Traceability monitoring and audit filters expose MVP pilot evidence", () => {
  const { services, admin, creator, project, ticket } = createSprint8Fixture();
  const change = services.prdChanges.convertTicketToChange(creator, project.id, {
    ticketId: ticket.id,
    title: "Add WFH leave visibility requirement",
    proposedRequirement: "WFH leave type must be visible on mobile request form.",
    affectedSections: ["core_flows"],
    acceptanceCriteria: ["WFH option appears on mobile"],
    riskLevel: "medium"
  });
  const approval = services.prdChanges.decideChange(creator, project.id, {
    changeId: change.id,
    decision: "approved",
    note: "Approved",
    approverUserId: creator.id
  });
  const domainRequest = services.domains.requestPublicDomain(creator, project.id, {
    domain: "leave.company.example",
    reason: "Pilot group needs a memorable URL",
    intendedAudience: "HR pilot users",
    dataClassification: "internal",
    externalUserPolicy: "approved_users",
    checklistAccepted: true
  });
  services.domains.decideDomainRequest(admin, domainRequest.id, { decision: "approved", note: "Approved" });

  const trace = services.traceability.getProjectTrace(creator, project.id);
  const monitoring = services.monitoring.getDashboard(admin);
  const filteredAudit = services.audit.filter({
    actorId: creator.id,
    action: "prd.change.approved",
    projectId: project.id,
    severity: "high"
  });

  assert.equal(trace.ticket.id, ticket.id);
  assert.equal(trace.prdChange.id, change.id);
  assert.equal(trace.prdVersion.id, approval.prdVersion.id);
  assert.equal(trace.domain.publicDomain, "leave.company.example");
  assert.ok(trace.deployment.deploymentId);
  assert.ok(trace.auditEventIds.length >= 3);
  assert.ok(monitoring.serviceHealth.some((service) => service.name === "Platform API" && service.status === "healthy"));
  assert.ok(monitoring.ticketCounts.open >= 1);
  assert.ok(monitoring.domainRequests.approved >= 1);
  assert.ok(filteredAudit.every((event) => event.action === "prd.change.approved" && event.actorId === creator.id));
});
