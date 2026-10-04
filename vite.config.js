import { defineConfig } from "vite";

// GitHub Pages(/honeymoon/)와 플레이스토어 앱(TWA) 모두에서 동작하도록 상대 경로로 빌드
export default defineConfig({
  base: "./",
  build: { outDir: "dist", sourcemap: true },
  server: { port: 5173 },
  preview: { port: 4173, strictPort: true },
});
