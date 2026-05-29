import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  appType: "mpa",
  build: {
    outDir: "dist",
    rollupOptions: {
      input: {
        index: resolve(__dirname, "index.html"),
        privacy: resolve(__dirname, "legal/privacy.html"),
        terms: resolve(__dirname, "legal/terms.html"),
        dpa: resolve(__dirname, "legal/dpa.html"),
        cookies: resolve(__dirname, "legal/cookies.html")
      }
    }
  },
  server: { host: "127.0.0.1", port: 5174 }
});
