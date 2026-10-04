import { test, expect, open, tab, savedPlan } from "./fixtures.js";

test.describe("구글 모드 (가짜 구글 API)", () => {
  test("장소 정보·구글 검색·지도 장소 클릭", async ({ page, calls }) => {
    await open(page, "?key=TEST");
    await expect(page.locator("body")).toHaveClass(/gmode/);
    await page.click('.place[data-id="opera"]');
    await expect(page.locator(".pop .gd")).toContainText("★ 4.7");
    await expect(page.locator(".pop .gd")).toContainText("영업시간");

    await page.fill("#q", "카페");
    await page.click("#btnGSearch");
    await expect(page.locator(".gres")).toHaveCount(2);
    await page.locator(".gres").nth(1).click();
    await page.click(".pop .btn.primary");
    expect((await savedPlan(page)).custom.map(c => c.gid)).toContain("ChIJ_other");

    await page.evaluate(() => window.__map.l.click({ placeId: "ChIJ_poi", latLng: { lat: () => -33.86, lng: () => 151.2 }, stop() {} }));
    await expect(page.locator(".pop")).toContainText("내 장소로 저장");
    expect(calls.places.length).toBeGreaterThan(0);
  });

  test("실제 경로를 그리고 결과를 캐시함", async ({ page, calls }) => {
    await open(page, "?key=TEST");
    await tab(page, "plan");
    await page.click("#btnSample");
    await expect(page.locator(".leg.real").first()).toContainText("14분");
    await expect(page.locator(".leg.real").first()).toContainText("T2");
    const first = calls.routes;
    expect(first).toBeGreaterThan(0);
    await page.reload();
    await tab(page, "plan");
    await expect(page.locator(".leg.real").first()).toContainText("14분");
    expect(calls.routes).toBe(first);   // 새로고침 후 추가 호출 없음
  });

  test("숙소 후보: 주소로 위치 찾기와 이동시간 비교", async ({ page }) => {
    await open(page, "?key=TEST");
    await tab(page, "stays");
    await page.click("#btnAddStay");
    await page.fill("[name=name]", "서리힐스 로프트");
    await page.fill("[name=price]", "300");
    await page.fill("[name=area]", "Surry Hills");
    await page.click("#stayForm button[type=submit]");
    await expect(page.locator(".stay-card")).toHaveCount(1);
    await expect(page.locator(".stay-card .commute")).toContainText("14분");
  });
});

test.describe("API 거부", () => {
  test.use({ googleMode: "denied" });
  test("경고를 띄우고 직선 거리로 대체", async ({ page }) => {
    await open(page, "?key=TEST");
    await tab(page, "plan");
    await page.click("#btnSample");
    await expect(page.locator("#apiNotice")).toContainText("Routes API");
    await expect(page.locator(".leg").first()).toContainText("직선");
  });
});

test.describe("키 인증 실패", () => {
  test.use({ googleMode: "authfail" });
  test("기본 지도로 한 번만 전환(무한 새로고침 없음)", async ({ page }) => {
    await page.goto("/index.html?key=BAD");
    await page.waitForURL(/nokey=1/);
    await page.waitForSelector("#list .place");
    await expect(page.locator("body")).not.toHaveClass(/gmode/);
  });
});
