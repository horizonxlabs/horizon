import { createPlatformApiApp, createRuntimePlatformApiServices, resolveCorePersistenceMode } from "./app-factory";

const port = Number(process.env.PORT ?? 3100);
const host = process.env.HOST ?? "127.0.0.1";
const corePersistenceMode = resolveCorePersistenceMode();

const services = await createRuntimePlatformApiServices();
const app = await createPlatformApiApp(services);
await app.listen(port, host);

console.log(`Platform API listening on http://${host}:${port} with core persistence mode: ${corePersistenceMode}`);
