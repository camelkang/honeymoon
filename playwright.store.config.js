import { defineConfig, devices } from "@playwright/test";

// 스토어 스크린샷 전용 (실제 지도 타일을 받아야 해서 네트워크가 되는 GitHub Actions에서 실행)
export default defineConfig({
  testDir: "store",
  timeout: 300_000,
  reporter: "list",
  use: {
    ...devices["Pixel 7"],
    viewport: { width: 360, height: 640 },
    deviceScaleFactor: 3,              // 1080 × 1920
    locale: "ko-KR",
    baseURL: "http://localhost:4176",
    serviceWorkers: "block",
    launchOptions: { args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] },
  },
  webServer: { command: "npx vite preview --port 4176 --strictPort", url: "http://localhost:4176/index.html" },
});
