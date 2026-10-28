import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Geliştirme sırasında /api ve /ws istekleri köprü sunucusuna yönlendirilir.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      "/api": "http://127.0.0.1:4000",
      "/ws": { target: "ws://127.0.0.1:4000", ws: true },
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
