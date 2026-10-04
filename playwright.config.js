import { defineConfig, devices } from "@playwright/test";

// 서비스 워커가 보내는 요청도 테스트 목(mock)으로 가로채기 위해 필요
process.env.PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS = "1";

export default defineConfig({
  testDir: "tests",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    serviceWorkers: "block",
    viewport: { width: 1300, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1300, height: 900 } } }],
  webServer: {
    command: "npm run serve",
    url: "http://localhost:4173/index.html",
    reuseExistingServer: !process.env.CI,
  },
});
