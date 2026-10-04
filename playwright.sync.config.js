import { defineConfig, devices } from "@playwright/test";

// 커플 동기화 테스트: Firebase 에뮬레이터(로그인·Firestore + 실제 보안 규칙)에 붙인 빌드로 두 사람을 흉내 냄
export default defineConfig({
  testDir: "tests-sync",
  timeout: 90_000,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never", outputFolder: "playwright-report-sync" }]] : "list",
  use: {
    baseURL: "http://localhost:4175",
    serviceWorkers: "block",
    viewport: { width: 1300, height: 900 },
    launchOptions: { args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader"] },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1300, height: 900 } } }],
  // 에뮬레이터는 `npm run test:sync`(firebase emulators:exec)가 띄우고 테스트가 끝나면 함께 내림
  webServer: {
    command: "VITE_FIREBASE_EMULATOR=1 vite build --outDir dist-emu && vite preview --outDir dist-emu --port 4175 --strictPort",
    url: "http://localhost:4175/index.html",
    timeout: 120_000,
    reuseExistingServer: false,
  },
});
