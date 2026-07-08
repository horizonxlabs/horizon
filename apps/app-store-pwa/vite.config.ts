import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/store/",
  plugins: [react()],
  server: {
    allowedHosts: [".trycloudflare.com", "elephant-capture-thunder-marion.trycloudflare.com", "localhost", "127.0.0.1"],
  },
});
