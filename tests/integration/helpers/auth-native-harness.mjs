import { executePlatformApiRequestAsync } from "../../../apps/platform-api/src/app-factory.ts";
import { createPlatformApiServices } from "../../../apps/platform-api/src/platform-services.ts";
import {
  MemoryCorePersistenceClient,
  createCoreRepositoryBackedService
} from "../../../apps/platform-api/src/persistence/core-repositories.ts";
import { createPlatformCredentialService } from "../../../apps/platform-api/src/auth/platform-credential-service.ts";
import { createCorePersistenceCredentialStore } from "../../../apps/platform-api/src/auth/prisma-credential-store.ts";

export function createNativeAuthServices() {
  const client = new MemoryCorePersistenceClient();
  return {
    ...createPlatformApiServices(),
    corePersistence: createCoreRepositoryBackedService(client),
    corePersistenceClient: client,
    credentialService: createPlatformCredentialService(createCorePersistenceCredentialStore(client))
  };
}

export function buildTestExecutor(options = {}) {
  const services = createNativeAuthServices();
  const envOverrides = options.env ?? {};

  async function request({ method, path, headers = {}, body }) {
    const previous = {};
    for (const key of Object.keys(envOverrides)) {
      previous[key] = process.env[key];
      process.env[key] = envOverrides[key];
    }
    try {
      return await executePlatformApiRequestAsync(services, { method, path, headers, body });
    } finally {
      for (const key of Object.keys(envOverrides)) {
        if (previous[key] === undefined) delete process.env[key];
        else process.env[key] = previous[key];
      }
    }
  }

  return {
    services,
    asAdmin: (opts) =>
      request({ ...opts, headers: { ...opts.headers, "x-mock-user-email": "admin@company.com" } }),
    asCreator: (opts) =>
      request({
        ...opts,
        headers: { ...opts.headers, "x-mock-user-email": "creator@company.com" }
      }),
    anon: (opts) => request(opts),
    withToken: (token, opts) =>
      request({ ...opts, headers: { ...opts.headers, authorization: `Bearer ${token}` } })
  };
}
