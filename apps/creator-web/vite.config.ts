import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
import { defineConfig } from "vite";

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
    react()
  ],
  resolve: { alias: { "@": resolve(__dirname, "src") } },
  server: {
    allowedHosts: [".trycloudflare.com", "elephant-capture-thunder-marion.trycloudflare.com", "localhost", "127.0.0.1"],
    proxy: {
      "/api": {
        target: "http://platform-api:3100",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "")
      }
    }
  }
});
