import { defineConfig } from "vite";

// GitHub Pages(/honeymoon/)와 플레이스토어 앱(TWA) 모두에서 동작하도록 상대 경로로 빌드
export default defineConfig({
  base: "./",
  build: {
    outDir: "dist", sourcemap: true,
    // 지도 엔진(maplibre-gl)은 따로 묶어, 앱 코드만 바뀔 때 다시 받지 않게 함
    rollupOptions: { output: { manualChunks: { maplibre: ["maplibre-gl"] } } },
    chunkSizeWarningLimit: 1100,
  },
  server: { port: 5173 },
  preview: { port: 4173, strictPort: true },
});
