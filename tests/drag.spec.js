import { test, expect, open, tab, savedPlan } from "./fixtures.js";

const names = (page, i) => page.locator("#days .day").nth(i).locator(".stop .nm span:first-child").allTextContents();
async function dragTo(page, from, to, where = "before") {
  await to.scrollIntoViewIfNeeded(); await from.scrollIntoViewIfNeeded();
  const a = await from.boundingBox(), b = await to.boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  const y = where === "before" ? b.y + 4 : where === "after" ? b.y + b.height - 4 : b.y + b.height / 2;
  for (let s = 1; s <= 8; s++) await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2 + (y - a.y - a.height / 2) * s / 8);
  await page.mouse.up();
}

test("번호를 잡고 끌어서 순서 바꾸기·다른 날로 옮기기", async ({ page }) => {
  await open(page);
  await tab(page, "plan");
  await page.click("#btnSample");
  const day0 = await names(page, 0), day1 = await names(page, 1);

  // 같은 날: 4번째를 2번째 앞으로
  const stops = page.locator("#days .day").nth(0).locator(".stop");
  await dragTo(page, stops.nth(3).locator(".n"), stops.nth(1), "before");
  await expect.poll(() => names(page, 0)).toEqual([day0[0], day0[3], day0[1], day0[2], ...day0.slice(4)]);

  // 다른 날: 첫째 날 마지막 장소를 둘째 날 첫 장소 뒤로 → 방문 시간도 따라감
  const order0 = await names(page, 0), moved = order0[order0.length - 1];
  const lastId = (await savedPlan(page)).days[0].stops.at(-1);
  await page.fill(`[data-time="0|${lastId}"]`, "14:30");
  const src = page.locator("#days .day").nth(0).locator(".stop").last();
  await dragTo(page, src.locator(".n"), page.locator("#days .day").nth(1).locator(".stop").nth(0), "after");
  await expect.poll(() => names(page, 1)).toEqual([day1[0], moved, ...day1.slice(1)]);
  expect(await names(page, 0)).not.toContain(moved);
  const plan = await savedPlan(page);
  expect(plan.days[1].stops[1]).toBe(lastId);
  expect(plan.days[1].times[lastId]).toBe("14:30");
  expect((plan.days[0].times || {})[lastId]).toBeUndefined();

  // 그냥 누르기만 하면 아무 일도 없음
  const before = await names(page, 0);
  await page.locator("#days .day").nth(0).locator(".stop .n").first().click();
  expect(await names(page, 0)).toEqual(before);
});

test("키보드: 번호에 초점을 두고 Alt+↓ / Alt+↑", async ({ page }) => {
  await open(page);
  await tab(page, "plan");
  await page.click("#btnSample");
  const day0 = await names(page, 0);
  await page.locator("#days .day").nth(0).locator(".stop .n").first().focus();
  await page.keyboard.press("Alt+ArrowDown");
  await expect.poll(() => names(page, 0)).toEqual([day0[1], day0[0], ...day0.slice(2)]);
  await expect(page.locator("#days .day").nth(0).locator(".stop .n").nth(1)).toBeFocused();
  await page.keyboard.press("Alt+ArrowUp");
  await expect.poll(() => names(page, 0)).toEqual(day0);
});

test("휴대폰 터치로도 끌기", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  await tab(page, "plan");
  await page.click("#btnSample");
  await page.evaluate(() => document.getElementById("sheet").style.setProperty("--sheet-h", "700px"));
  await page.waitForTimeout(500);   // 시트가 커지는 애니메이션이 끝난 뒤 위치 측정
  const day0 = await names(page, 0);
  const stops = page.locator("#days .day").nth(0).locator(".stop");
  await stops.nth(2).scrollIntoViewIfNeeded(); await stops.nth(0).scrollIntoViewIfNeeded();
  const a = await stops.nth(0).locator(".n").boundingBox(), b = await stops.nth(2).boundingBox();
  // 손가락(포인터 종류: touch)으로 첫 장소를 3번째 뒤로
  await page.evaluate(({ a, b }) => {
    const h = document.querySelector('#days .n[data-drag="0,0"]');
    const ev = (type, x, y, target) => (target || h).dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: "touch", clientX: x, clientY: y, isPrimary: true }));
    const x = a.x + a.width / 2;
    ev("pointerdown", x, a.y + a.height / 2);
    for (let s = 1; s <= 6; s++) ev("pointermove", x, a.y + (b.y + b.height - 4 - a.y) * s / 6);
    ev("pointerup", x, b.y + b.height - 4);
  }, { a, b });
  await expect.poll(() => names(page, 0)).toEqual([day0[1], day0[2], day0[0], ...day0.slice(3)]);
});
