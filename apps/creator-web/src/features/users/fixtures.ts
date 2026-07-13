export const appMembers = [
  {
    user: "Creator User",
    type: "internal",
    role: "HR Admin",
    status: "active",
    lastAccess: "2026-08-20"
  },
  {
    user: "End User",
    type: "internal",
    role: "Employee",
    status: "active",
    lastAccess: "2026-08-20"
  }
];
export const pendingInvites = [
  {
    email: "manager@company.com",
    role: "Manager",
    invitedBy: "Creator User",
    expires: "2026-09-01",
    status: "pending"
  },
  {
    email: "vendor@example.com",
    role: "Employee",
    invitedBy: "Creator User",
    expires: "2026-09-01",
    status: "approval_required"
  }
];
export const accessRequests = [
  {
    requester: "manager@company.com",
    role: "Manager",
    reason: "Needs approval queue access",
    submitted: "2026-08-17",
    status: "pending"
  }
];
export const appRoles = [
  {
    role: "Employee",
    permissions: "leave:request, leave:view-own",
    members: "1",
    status: "active"
  },
  { role: "Manager", permissions: "leave:approve, leave:view-team", members: "0", status: "ready" },
  { role: "HR Admin", permissions: "leave:admin, leave:report", members: "1", status: "active" }
];
