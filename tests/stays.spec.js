import { test, expect, open, tab, savedPlan, clickMap } from "./fixtures.js";

async function addStay(page, { name, price, rating }) {
  await page.click("#btnAddStay");
  await page.fill("[name=url]", "https://www.airbnb.co.kr/rooms/123");
  await page.fill("[name=name]", name);
  await page.fill("[name=price]", String(price));
  await page.fill("[name=rating]", String(rating));
  await page.click("#stayForm button[type=submit]");
}

test("에어비앤비 후보 추가(지도에서 위치 찍기)·확정·정렬·삭제", async ({ page }) => {
  await open(page);
  await tab(page, "stays");
  await addStay(page, { name: "하버뷰 아파트", price: 420, rating: 4.92 });
  await expect(page.locator("#banner")).toContainText("위치를 지도에서 클릭");
  await clickMap(page, 0.5, 0.5);
  await addStay(page, { name: "본다이 스튜디오", price: 260, rating: 4.8 });
  await clickMap(page, 0.7, 0.6);
  await expect(page.locator(".stay-card")).toHaveCount(2);
  await expect(page.locator(".stay-card .nm").first()).toContainText("본다이");   // 가격 낮은 순
  await page.selectOption("#staySort", "rating");
  await expect(page.locator(".stay-card .nm").first()).toContainText("하버뷰");
  await page.locator('.stay-card [data-act="choose"]').first().click();
  expect((await savedPlan(page)).stayChosen).toBeTruthy();
  await expect(page.locator(".stay-card.on")).toHaveCount(1);
  await page.locator('.stay-card [data-act="del"]').last().click();
  await expect(page.locator(".stay-card")).toHaveCount(1);
});

test("위치 찍기를 Esc로 취소하면 저장되지 않음", async ({ page }) => {
  await open(page);
  await tab(page, "stays");
  await addStay(page, { name: "취소용", price: 100, rating: 4 });
  await page.keyboard.press("Escape");
  await expect(page.locator("#banner")).toContainText("취소");
  expect((await savedPlan(page)).stays).toHaveLength(0);
});

test("에어비앤비 검색 링크에 지도 영역·날짜·인원이 들어감", async ({ page }) => {
  await open(page);
  await tab(page, "plan");
  await page.fill("#startDate", "2026-12-10");
  await page.dispatchEvent("#startDate", "change");
  await tab(page, "stays");
  await expect(page.locator("#stayDates")).toContainText("2026-12-14 (4박)");
  const [req] = await Promise.all([
    page.context().waitForEvent("request", r => r.url().includes("airbnb.co.kr")),
    page.click("#btnAirbnb"),
  ]);
  const u = new URL(req.url());
  expect(u.pathname).toContain("Sydney--NSW--Australia");
  expect(u.searchParams.get("checkin")).toBe("2026-12-10");
  expect(u.searchParams.get("checkout")).toBe("2026-12-14");
  expect(u.searchParams.get("adults")).toBe("2");
  expect(Number(u.searchParams.get("ne_lat"))).toBeGreaterThan(Number(u.searchParams.get("sw_lat")));
});
