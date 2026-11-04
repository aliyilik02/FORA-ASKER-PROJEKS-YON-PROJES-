import { defineConfig } from "vite";

// Köprü, derlenmiş oynatıcıyı /oynatici/ altında sunar; göreli yollar için base "./".
export default defineConfig({
  base: "./",
  server: {
    port: 5174,
    host: true,
    proxy: {
      "/api": "http://127.0.0.1:4000",
      "/ws": { target: "ws://127.0.0.1:4000", ws: true },
    },
  },
  build: { outDir: "dist", emptyOutDir: true },
});
