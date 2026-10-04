import { test, expect, open, tab } from "./fixtures.js";
import { readFileSync } from "node:fs";

test("하루 일정·전체 일정을 이미지로 저장 (공유 창이 없는 PC)", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-12-08T09:00:00"));
  await open(page);
  await tab(page, "plan");
  await page.fill("#startDate", "2026-12-10");
  await page.click("#btnSample");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.locator('#days [data-share="0"]').click()]);
  expect(dl.suggestedFilename()).toBe("duriseo-sydney-day1.png");
  const png = readFileSync(await dl.path());
  expect(png.subarray(1, 4).toString()).toBe("PNG");
  expect(png.readUInt32BE(16)).toBe(1080);              // 가로 1080
  expect(png.readUInt32BE(20)).toBeGreaterThanOrEqual(1350);
  await expect(page.locator("#banner")).toContainText("일정 이미지를 저장했어요");

  const [dl2] = await Promise.all([page.waitForEvent("download"), page.click("#btnShareTrip")]);
  expect(dl2.suggestedFilename()).toBe("duriseo-sydney-trip.png");
  // 눈으로 확인할 수 있게 저장
  await dl.saveAs(test.info().outputPath("day1.png")); await dl2.saveAs(test.info().outputPath("trip.png"));
});
