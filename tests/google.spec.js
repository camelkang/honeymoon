import { test, expect, open, tab, savedPlan, clickPoi } from "./fixtures.js";

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

    // 지도 위 가게 아이콘 클릭 → 이름으로 구글 장소를 찾아 팝업에 정보 표시
    await clickPoi(page, { name: "Opera Bar", lat: -33.8575, lng: 151.2141 + 0.001 });
    await expect(page.locator(".pop")).toContainText("내 장소로 저장");
    await expect(page.locator(".pop .gd")).toContainText("★ 4.7");
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
    await expect(page.locator("#apiNotice")).toContainText("실제 이동 경로를 불러올 수 없어서 직선 거리로");
    await expect(page.locator("#apiNotice")).not.toContainText("Routes API");   // 영문 오류는 사용자에게 안 보여줌
    await expect(page.locator(".leg").first()).toContainText("직선");
    await page.click("#apiNotice [data-x]");
    await expect(page.locator("#apiNotice")).toBeHidden();
  });
});

test.describe("잘못된 키", () => {
  test.use({ googleMode: "badkey" });
  test("지도는 그대로 쓰고, 경고 후 직선 거리로 대체", async ({ page }) => {
    await open(page, "?key=BAD");
    await tab(page, "plan");
    await page.click("#btnSample");
    await expect(page.locator("#apiNotice")).toBeVisible();
    await expect(page.locator(".leg").first()).toContainText("직선");
    await expect(page.locator(".mk-pin").first()).toBeVisible();
  });
});

test("키 없이(?nokey=1) 열면 구글 기능을 숨김", async ({ page, calls }) => {
  await open(page, "?nokey=1");
  await expect(page.locator("body")).not.toHaveClass(/gmode/);
  await expect(page.locator("#btnGSearch")).toBeHidden();
  await page.click('.place[data-id="opera"]');
  await expect(page.locator(".pop h3")).toContainText("오페라");
  expect(calls.places).toHaveLength(0);
});
