export const serviceHealthRows = [
  { service: "Platform API", status: "healthy", signal: "p95 42ms", owner: "IT Admin" },
  { service: "PostgreSQL", status: "healthy", signal: "migration current", owner: "System" },
  { service: "Redis + BullMQ", status: "healthy", signal: "0 delayed jobs", owner: "System" },
  { service: "MinIO", status: "healthy", signal: "screenshots retained", owner: "System" },
  { service: "Caddy Proxy", status: "healthy", signal: "domain route active", owner: "IT Admin" }
];
