import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const apiTarget = process.env.VITE_API_TARGET ?? "http://localhost:3100";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": resolve(import.meta.dirname, "src") } },
  server: {
    allowedHosts: [
      ".trycloudflare.com",
      "elephant-capture-thunder-marion.trycloudflare.com",
      "localhost",
      "127.0.0.1"
    ],
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "")
      }
    }
  }
});
