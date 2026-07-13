export const authProviderRows = [
  {
    provider: "Keycloak Default",
    type: "keycloak",
    status: "active",
    mapping: "evcp-admins -> admin"
  },
  {
    provider: "Azure AD Production",
    type: "oidc",
    status: "ready",
    mapping: "hr-creators -> creator"
  },
  { provider: "Okta Workforce", type: "saml", status: "ready", mapping: "IT Admins -> admin" }
];

export const authReadinessRows = [
  ["OIDC", "ready", "Azure AD config masked"],
  ["SAML", "ready", "Okta certificate fingerprint"],
  ["Keycloak Default", "active", "broker realm evcp"],
  ["Direct IdP Constraints", "review", "Platform Auth boundary only"]
] as const;

export const authMappingRows = [
  { source: "evcp-admins", platform: "admin", project: "Project Owner", app: "HR Admin" },
  { source: "hr-creators", platform: "creator", project: "Editor", app: "Manager" },
  { source: "evcp-users", platform: "end_user", project: "Viewer", app: "Employee" }
];

export const policyRows = [
  { classification: "Public", reviewers: "none", checks: "auth session", exposure: "allowed" },
  {
    classification: "Internal",
    reviewers: "Project Owner",
    checks: "auth + app role",
    exposure: "approved users"
  },
  {
    classification: "Confidential",
    reviewers: "Security Admin",
    checks: "audit high severity",
    exposure: "blocked"
  },
  {
    classification: "Restricted",
    reviewers: "Security + Platform Admin",
    checks: "break-glass disabled",
    exposure: "blocked"
  }
];
