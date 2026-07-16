import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const apiTarget = process.env.VITE_API_TARGET ?? "http://localhost:3100";

export default defineConfig({
  base: "/creator/",
  plugins: [
    {
      name: "creator-base-redirect",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.url === "/creator") {
            response.statusCode = 302;
            response.setHeader("Location", "/creator/");
            response.end();
            return;
          }
          next();
        });
      }
    },
    react(),
    tailwindcss()
  ],
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  server: {
    allowedHosts: [".trycloudflare.com", "elephant-capture-thunder-marion.trycloudflare.com", "localhost", "127.0.0.1"],
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
