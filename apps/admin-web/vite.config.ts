import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  server: {
    allowedHosts: [".trycloudflare.com", "elephant-capture-thunder-marion.trycloudflare.com", "localhost", "127.0.0.1"],
  },
});
