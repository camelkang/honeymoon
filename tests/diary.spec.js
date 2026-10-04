import { test, expect, open, tab, savedPlan } from "./fixtures.js";

test("여행 일기: 지난 날·오늘만 쓰고, 별점과 돌아보기에 모임", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-12-11T20:00:00"));
  await open(page);
  await tab(page, "plan");
  await page.fill("#startDate", "2026-12-10");
  await page.click("#btnSample");
  const day = i => page.locator("#days .day").nth(i);
  await expect(day(0).locator(".diary")).toBeVisible();
  await expect(day(1).locator(".diary")).toBeVisible();     // 오늘
  await expect(day(2).locator(".diary")).toHaveCount(0);    // 아직 안 온 날

  await day(0).locator('[data-mood="0|😍"]').click();
  await expect(day(0).locator('[data-mood="0|😍"]')).toHaveClass(/on/);
  await day(0).locator("[data-diary]").fill("오페라 바 선셋 최고");
  await day(0).locator("[data-diary]").press("Enter");
  await expect.poll(async () => (await savedPlan(page)).diary["0"].me).toMatchObject({ mood: "😍", text: "오페라 바 선셋 최고" });

  // 첫날 다녀온 곳에 별점
  const firstId = (await savedPlan(page)).days[0].stops[3];
  await day(0).locator(`.stop .nm[data-open="${firstId}"]`).click();
  const pop = page.locator(".maplibregl-popup");
  await expect(pop.locator(".rate")).toContainText("다녀왔어요");
  await pop.locator(`[data-rate="${firstId}|5"]`).click();
  await expect(page.locator(".maplibregl-popup .star.on")).toHaveCount(5);
  expect((await savedPlan(page)).ratings[firstId].me).toBe(5);

  await tab(page, "prep");
  const recap = page.locator(".recap");
  await expect(recap).toContainText("지금까지 우리 여행");
  await expect(recap.locator(".recap-stats div").first()).toContainText("2");
  await expect(recap.locator(".recap-top")).toContainText("★★★★★");
  await expect(recap.locator(".recap-days")).toContainText("오페라 바 선셋 최고");
});

test("여행 전에는 일기·돌아보기가 없음", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-01T09:00:00"));
  await open(page);
  await tab(page, "plan");
  await page.fill("#startDate", "2026-12-10");
  await page.click("#btnSample");
  await expect(page.locator("#days .diary")).toHaveCount(0);
  await tab(page, "prep");
  await expect(page.locator(".recap")).toHaveCount(0);
});
