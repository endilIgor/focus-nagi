import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Production build emits straight into Spring Boot's classpath static resources
// folder so `./mvnw package` / the Docker image serve the UI from the same
// origin as the API (no separate frontend host, no CORS in production).
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../src/main/resources/static",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8080", changeOrigin: true },
      "/actuator": { target: "http://localhost:8080", changeOrigin: true },
    },
  },
});
