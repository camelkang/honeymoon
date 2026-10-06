import { test, expect, open, tab, savedPlan } from "./fixtures.js";

const dayKm = async (page, i) => parseFloat((await page.locator("#days .day").nth(i).locator(".day-h .muted").textContent()).match(/([\d.]+)km/)[1]);

test("동선 자동 정리: 첫 장소는 그대로, 더 짧은 순서로, 되돌리기 가능", async ({ page }) => {
  await open(page);
  await tab(page, "plan");
  await page.click("#btnSample");
  // 일부러 꼬인 순서로: 첫 날 장소 순서를 뒤섞음 (첫 장소는 그대로)
  const plan0 = await savedPlan(page);
  const original = plan0.days[1].stops;
  const shuffled = [original[0], ...original.slice(1).reverse().filter((_, k) => k % 2 === 0), ...original.slice(1).reverse().filter((_, k) => k % 2 === 1)];
  await page.evaluate(([s]) => {
    const a = JSON.parse(localStorage.getItem("honeymoon-app-v2")); a.plans[a.current].days[1].stops = s;
    localStorage.setItem("honeymoon-app-v2", JSON.stringify(a));
  }, [shuffled]);
  await page.reload(); await page.waitForFunction(() => window.__map && window.__map.loaded());
  await tab(page, "plan");
  const before = await dayKm(page, 1);
  await page.locator('#days [data-opt="1"]').click();
  await expect(page.locator("#banner")).toContainText("→");
  const after = await dayKm(page, 1);
  expect(after).toBeLessThan(before);
  const optimized = (await savedPlan(page)).days[1].stops;
  expect(optimized[0]).toBe(shuffled[0]);
  expect([...optimized].sort()).toEqual([...shuffled].sort());

  // 다시 누르면 이미 가장 짧음
  await page.locator('#days [data-opt="1"]').click();
  await expect(page.locator("#banner")).toContainText("이미 가장 짧은 순서예요");

  // 되돌리기 (새로 정리 → 바로 되돌리기)
  await page.evaluate(([s]) => {
    const a = JSON.parse(localStorage.getItem("honeymoon-app-v2")); a.plans[a.current].days[1].stops = s;
    localStorage.setItem("honeymoon-app-v2", JSON.stringify(a));
  }, [shuffled]);
  await page.reload(); await page.waitForFunction(() => window.__map && window.__map.loaded());
  await tab(page, "plan");
  // 정리 버튼을 누르고 곧바로 알림에 손가락을 올림 → 올려 둔 동안은 알림이 사라지지 않음 (느린 환경에서도 안정적으로)
  await page.locator('#days [data-opt="1"]').scrollIntoViewIfNeeded();
  await page.evaluate(() => {
    document.querySelector('#days [data-opt="1"]').click();
    document.getElementById("banner").dispatchEvent(new PointerEvent("pointerenter"));
  });
  await page.locator("#banner .banner-act").click();
  expect((await savedPlan(page)).days[1].stops).toEqual(shuffled);
});
