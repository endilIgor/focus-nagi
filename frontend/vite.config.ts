import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Production: Vercel serves dist/ and rewrites /api/* to the Cloudflare Worker (see
// scripts/vercel-output.mjs), so the browser keeps calling same-origin relative /api URLs.
// Development: the same /api paths are proxied to `wrangler dev` (worker/, port 8787).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://127.0.0.1:8787", changeOrigin: true },
    },
  },
});
