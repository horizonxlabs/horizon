import assert from "node:assert/strict";
import { test } from "node:test";

const { executePlatformApiRequestAsync } = await import(
  "../../apps/platform-api/src/app-factory.ts"
);
const { createPlatformApiServices } = await import(
  "../../apps/platform-api/src/platform-services.ts"
);
const { MemoryCorePersistenceClient, createCoreRepositoryBackedService } = await import(
  "../../apps/platform-api/src/persistence/core-repositories.ts"
);
const { createPlatformCredentialService } = await import(
  "../../apps/platform-api/src/auth/platform-credential-service.ts"
);
const { createCorePersistenceCredentialStore } = await import(
  "../../apps/platform-api/src/auth/prisma-credential-store.ts"
);
const {
  BusinessSettingsRepositoryBackedService,
  MemoryBusinessSettingsPersistenceClient,
  createBusinessSettingsRepositoryBackedService,
  BUSINESS_SETTINGS_SINGLETON_ID
} = await import("../../apps/platform-api/src/persistence/business-settings-repositories.ts");

const admin = { id: "usr_admin", email: "admin@company.com", name: "Admin", role: "admin" };
const creator = {
  id: "usr_creator",
  email: "creator@company.com",
  name: "Creator",
  role: "creator"
};

function createSetupServices() {
  const client = new MemoryCorePersistenceClient();
  return {
    ...createPlatformApiServices(),
    corePersistence: createCoreRepositoryBackedService(client),
    corePersistenceClient: client,
    credentialService: createPlatformCredentialService(
      createCorePersistenceCredentialStore(client)
    ),
    businessSettingsPersistence: createBusinessSettingsRepositoryBackedService(
      new MemoryBusinessSettingsPersistenceClient()
    )
  };
}

// ---------------------------------------------------------------------------
// Repository-level tests
// ---------------------------------------------------------------------------

test("repo: saveBusinessSettings requires an admin actor", async () => {
  const service = new BusinessSettingsRepositoryBackedService(
    new MemoryBusinessSettingsPersistenceClient()
  );

  await assert.rejects(
    () => service.saveBusinessSettings(creator, { businessName: "Acme" }),
    /cannot manage business settings/
  );

  const saved = await service.saveBusinessSettings(admin, { businessName: "Acme Co" });
  assert.equal(saved.businessName, "Acme Co");
  assert.equal(saved.id, BUSINESS_SETTINGS_SINGLETON_ID);
});

test("repo: getSetupStatus flips after completeSetup and saveBusinessSettings never stamps it", async () => {
  const service = new BusinessSettingsRepositoryBackedService(
    new MemoryBusinessSettingsPersistenceClient()
  );

  const before = await service.getSetupStatus();
  assert.deepEqual(before, { setupCompleted: false, businessName: null });

  await service.saveBusinessSettings(admin, { businessName: "Pre Setup" });
  const stillIncomplete = await service.getSetupStatus();
  assert.equal(stillIncomplete.setupCompleted, false);
  assert.equal(stillIncomplete.businessName, "Pre Setup");

  await service.completeSetup({ businessName: "Completed Co", timezone: "UTC", locale: "en" });
  const after = await service.getSetupStatus();
  assert.equal(after.setupCompleted, true);
  assert.equal(after.businessName, "Completed Co");

  const record = await service.getBusinessSettings();
  assert.ok(record.setupCompletedAt);
});

test("repo: upsert keeps a single singleton row", async () => {
  const client = new MemoryBusinessSettingsPersistenceClient();
  const service = new BusinessSettingsRepositoryBackedService(client);

  await service.saveBusinessSettings(admin, { businessName: "First" });
  await service.saveBusinessSettings(admin, { businessName: "Second", timezone: "UTC" });

  const record = await service.getBusinessSettings();
  assert.equal(record.id, BUSINESS_SETTINGS_SINGLETON_ID);
  assert.equal(record.businessName, "Second");
  assert.equal(record.timezone, "UTC");
});

// ---------------------------------------------------------------------------
// Route-level tests (via executePlatformApiRequestAsync)
// ---------------------------------------------------------------------------

test("route: GET /setup/status is unauthenticated and reports not-completed initially", async () => {
  const services = createSetupServices();

  const response = await executePlatformApiRequestAsync(services, {
    method: "GET",
    path: "/setup/status",
    headers: {}
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.deepEqual(response.body.data, { setupCompleted: false, businessName: null });
});

test("route: POST /setup/initialize creates a real admin, flips flag, and is one-shot", async () => {
  const services = createSetupServices();
  let keycloakProvision;
  services.keycloakUserManagement = {
    create: async (actor, input) => {
      keycloakProvision = { actor, input };
      return { id: "kc-owner", email: input.email, name: input.name, enabled: true, groups: ["evcp-admins"] };
    }
  };

  const payload = {
    business: {
      businessName: "Bangkok Widgets",
      timezone: "Asia/Bangkok",
      locale: "th",
      contactEmail: "hello@widgets.co",
      industry: "manufacturing"
    },
    admin: {
      email: "owner@widgets.co",
      name: "Owner",
      password: "supersecret1"
    }
  };

  const created = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: "/setup/initialize",
    headers: {},
    body: payload
  });

  assert.equal(created.status, 201);
  assert.equal(created.body.ok, true);
  assert.deepEqual(created.body.data, { setupCompleted: true });
  assert.equal(keycloakProvision.input.email, "owner@widgets.co");
  assert.equal(keycloakProvision.input.role, "admin");
  assert.equal(keycloakProvision.input.temporaryPassword, "supersecret1");
  assert.equal(keycloakProvision.actor.role, "admin");

  // Admin user genuinely persisted with admin role + password hash.
  const user = await services.corePersistenceClient.platformUser.findUnique({
    where: { email: "owner@widgets.co" }
  });
  assert.ok(user, "admin user should exist");
  assert.ok(user.passwordHash, "admin user should have a password hash");
  assert.ok(
    user.roles.some((entry) => entry.role.key === "admin"),
    "admin user should hold the admin role"
  );

  // Flag flipped.
  const status = await executePlatformApiRequestAsync(services, {
    method: "GET",
    path: "/setup/status",
    headers: {}
  });
  assert.equal(status.body.data.setupCompleted, true);
  assert.equal(status.body.data.businessName, "Bangkok Widgets");

  // One-shot: a second initialize is rejected.
  const second = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: "/setup/initialize",
    headers: {},
    body: payload
  });
  assert.equal(second.status, 409);
  assert.equal(second.body.ok, false);
  assert.equal(second.body.error.code, "setup_already_completed");
});

test("route: POST /setup/initialize validates input and duplicate email", async () => {
  const services = createSetupServices();

  const invalid = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: "/setup/initialize",
    headers: {},
    body: {
      business: { businessName: "" },
      admin: { email: "not-an-email", name: "", password: "short" }
    }
  });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error.code, "invalid_input");

  // Seed an existing user, then attempt to reuse the email.
  await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: "/admin/users",
    headers: { "x-mock-user-email": "admin@company.com" },
    body: { email: "dupe@widgets.co", name: "Dupe", tempPassword: "temp12345", role: "creator" }
  });

  const dup = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: "/setup/initialize",
    headers: {},
    body: {
      business: { businessName: "Widgets", timezone: "Asia/Bangkok", locale: "th" },
      admin: { email: "dupe@widgets.co", name: "Owner", password: "supersecret1" }
    }
  });
  assert.equal(dup.status, 409);
  assert.equal(dup.body.error.code, "email_exists");
});

test("route: GET /admin/business-settings is admin-gated (403 without admin)", async () => {
  const services = createSetupServices();

  const forbidden = await executePlatformApiRequestAsync(services, {
    method: "GET",
    path: "/admin/business-settings",
    headers: { "x-mock-user-email": "creator@company.com" }
  });
  assert.equal(forbidden.status, 403);

  const ok = await executePlatformApiRequestAsync(services, {
    method: "GET",
    path: "/admin/business-settings",
    headers: { "x-mock-user-email": "admin@company.com" }
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.ok, true);
  assert.equal(ok.body.data.setupCompleted, false);
  assert.equal(ok.body.data.timezone, "Asia/Bangkok");
});

test("route: PUT (POST-mapped) /admin/business-settings saves via admin and returns DTO", async () => {
  const services = createSetupServices();

  const saved = await executePlatformApiRequestAsync(services, {
    method: "POST",
    path: "/admin/business-settings",
    headers: { "x-mock-user-email": "admin@company.com" },
    body: { businessName: "Edited Co", timezone: "UTC", locale: "en", website: "https://edited.co" }
  });

  assert.equal(saved.status, 200);
  assert.equal(saved.body.data.businessName, "Edited Co");
  assert.equal(saved.body.data.timezone, "UTC");
  assert.equal(saved.body.data.website, "https://edited.co");
  assert.equal(saved.body.data.setupCompleted, false);
});
