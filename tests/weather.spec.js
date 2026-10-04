import { test, expect, open, tab } from "./fixtures.js";

test("16일 안의 날짜는 예보, 먼 날짜는 작년 같은 날 날씨", async ({ page, calls }) => {
  await page.clock.setFixedTime(new Date("2026-12-01T09:00:00"));
  await open(page);
  await tab(page, "plan");
  await page.fill("#startDate", "2026-12-14");
  await page.click("#dayPlus"); await page.click("#dayPlus");   // 12/14 ~ 12/20 (7일)
  const chip = i => page.locator("#days .day").nth(i).locator(".wx");
  await expect(chip(0)).toHaveText("☀️ 24° / 17° ☔ 40%");
  await expect(chip(2)).toHaveText("☀️ 24° / 17° ☔ 40%");    // 12/16 = 예보 마지막 날
  await expect(chip(3)).toHaveText("작년 🌧️ 21° / 15°");       // 12/17부터는 예보가 없음
  await expect(chip(6)).toHaveClass(/past/);

  // 캐시: 다시 그려도 다시 받지 않음
  const n = calls.weather;
  await page.fill('[data-note="0"]', "메모");
  await tab(page, "places"); await tab(page, "plan");
  await expect(chip(0)).toBeVisible();
  expect(calls.weather).toBe(n);
});

test("여행 중 오늘 카드에도 날씨", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-12-11T09:00:00"));
  await open(page);
  await tab(page, "plan");
  await page.fill("#startDate", "2026-12-10");
  await expect(page.locator("#todayCard .wx")).toContainText("☀️ 24° / 17°");
});
