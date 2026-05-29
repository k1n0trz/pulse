import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: false
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    target: "es2022",
    rollupOptions: {
      output: {
        // Split heavy vendors into cacheable chunks so the main bundle stays small.
        manualChunks: {
          charts: ["recharts"],
          icons: ["lucide-react"],
          clerk: ["@clerk/clerk-react"]
        }
      }
    }
  }
});
