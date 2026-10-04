import { test, expect, open } from "./fixtures.js";

test("휴대폰 화면에서 가로로 넘치지 않음", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await page.selectOption("#citySel", "goldcoast");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test.describe("설치형 앱", () => {
  test.use({ serviceWorkers: "allow" });
  test("매니페스트·서비스 워커·오프라인 열기", async ({ page, context }) => {
    await open(page);
    const m = await page.evaluate(async () => (await (await fetch("manifest.webmanifest")).json()));
    expect(m.display).toBe("standalone");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator("#citySel")).toBeVisible();
    await context.setOffline(false);
  });
});
