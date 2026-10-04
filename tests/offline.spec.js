import { test, expect, open, tab } from "./fixtures.js";

test("여행 지역 지도 미리 저장·지우기", async ({ page, context }) => {
  let tiles = 0;
  // 지도 타일 정보와 타일(가짜 2KB)
  await context.route("**/tiles.openfreemap.org/planet", r => r.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify({ tiles: ["https://tiles.openfreemap.org/planet/test/{z}/{x}/{y}.pbf"], maxzoom: 14 }) }));
  await context.route("**/tiles.openfreemap.org/planet/test/**", r => { tiles++; r.fulfill({ body: Buffer.alloc(2048, 1), headers: { "access-control-allow-origin": "*" } }); });
  await open(page);
  await tab(page, "plan");
  await page.click("#btnSample");
  await tab(page, "prep");
  const card = page.locator("#offlineCard");
  await expect(card).toContainText("이 여행 지역 지도 저장");
  await card.locator('[data-off="get"]').click();
  await expect(card).toContainText("저장돼 있어요", { timeout: 20_000 });
  await expect(page.locator("#banner")).toContainText("지도를 저장했어요");
  const cached = await page.evaluate(async () => (await (await caches.open("offline-sydney")).keys()).length);
  expect(cached).toBe(tiles);
  expect(cached).toBeGreaterThan(30);
  await expect(card).toContainText(`${cached.toLocaleString()}장`);

  // 다시 받으면 이미 받은 건 건너뜀
  const before = tiles;
  await card.locator('[data-off="get"]').click();
  await expect(card).toContainText("저장돼 있어요", { timeout: 20_000 });
  expect(tiles).toBe(before);

  await card.locator('[data-off="remove"]').click();
  await expect(card).toContainText("이 여행 지역 지도 저장");
  expect(await page.evaluate(() => caches.has("offline-sydney"))).toBe(false);
});
