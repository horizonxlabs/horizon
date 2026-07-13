import type { SimulatedSsoLoginInput } from "@evcp/api-client";

export const creatorSessionBridgeProfile: SimulatedSsoLoginInput = {
  subject: "keycloak-creator-ui-bridge",
  email: "creator@company.com",
  name: "Creator User",
  groups: ["evcp-creators"],
  appRoles: { "leave-management": ["HR Admin"] }
};
