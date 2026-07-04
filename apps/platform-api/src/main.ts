import { createPlatformApiApp } from "./app-factory";

const port = Number(process.env.PORT ?? 3100);
const host = process.env.HOST ?? "127.0.0.1";

const app = await createPlatformApiApp();
await app.listen(port, host);

console.log(`Platform API listening on http://${host}:${port}`);
