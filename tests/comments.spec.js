import { test, expect, open, savedPlan } from "./fixtures.js";

test("장소 창에서 메모 남기기·지우기, 목록에 개수 표시", async ({ page }) => {
  await open(page);
  await page.click("#list .place >> nth=0");
  const pop = page.locator(".maplibregl-popup");
  await pop.locator(".cm-form [name=t]").fill("여기 꼭 가자!");
  await pop.locator(".cm-form [name=t]").press("Enter");
  await expect(pop.locator(".cm-msg.mine")).toContainText("여기 꼭 가자!");
  await expect(pop.locator(".cm-form [name=t]")).toBeFocused();
  await pop.locator(".cm-form [name=t]").fill("공연 예매 필요");
  await pop.locator(".cm-form button").click();
  await expect(pop.locator(".cm-msg")).toHaveCount(2);
  await expect(page.locator("#list .place").first().locator(".cm-n")).toHaveText("2");

  // 빈 메모는 안 남음
  await pop.locator(".cm-form button").click();
  await expect(pop.locator(".cm-msg")).toHaveCount(2);

  await pop.locator(".cm-msg").first().locator("[data-cmdel]").click();
  await expect(pop.locator(".cm-msg")).toHaveCount(1);
  const plan = await savedPlan(page);
  const all = Object.values(plan.comments).flatMap(b => Object.values(b));
  expect(all.map(c => [c.text, c.by])).toEqual([["공연 예매 필요", "me"]]);
});
