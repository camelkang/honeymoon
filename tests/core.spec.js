import { test, expect, open, tab, savedPlan } from "./fixtures.js";

test.describe("장소·일정 (기본 지도)", () => {
  test("추천 장소 목록과 카테고리·검색 필터", async ({ page }) => {
    await open(page);
    await expect(page.locator("#list .place")).toHaveCount(50);
    await page.click('#chips [data-cat="sight"]');               // 명소 끄기
    const n = await page.locator("#list .place").count();
    expect(n).toBeLessThan(50);
    await page.fill("#q", "오페라");
    await expect(page.locator("#list .place").first()).toContainText("오페라");
  });

  test("장소 팝업에서 일정에 추가하고 순서 변경·이동·삭제", async ({ page }) => {
    await open(page);
    await page.click('.place[data-id="opera"]');
    await expect(page.locator(".pop h3")).toContainText("오페라 하우스");
    await page.selectOption("#popDay", "1");
    await page.click(".pop .btn.primary");
    await page.click('.place[data-id="bridge"]');
    await page.selectOption("#popDay", "1");
    await page.click(".pop .btn.primary");
    expect((await savedPlan(page)).days[1].stops).toEqual(["opera", "bridge"]);

    await tab(page, "plan");
    await page.click('[data-mv="1,1,-1"]');                       // bridge 위로
    expect((await savedPlan(page)).days[1].stops).toEqual(["bridge", "opera"]);
    page.__promptAnswer = "3";
    await page.click('[data-shift="1,0"]');                       // bridge → Day 3
    expect((await savedPlan(page)).days[2].stops).toEqual(["bridge"]);
    await page.click('[data-rm="1,0"]');
    expect((await savedPlan(page)).days[1].stops).toEqual([]);
  });

  test("추천 일정, 메모·방문 시간 저장, 길안내 링크", async ({ page }) => {
    await open(page);
    await tab(page, "plan");
    await page.click("#btnSample");
    await expect(page.locator(".day")).toHaveCount(6);
    await page.fill('[data-note="0"]', "공항 픽업 10시");
    await page.locator("input[data-time]").first().fill("10:30");
    const plan = await savedPlan(page);
    expect(plan.days[0].note).toBe("공항 픽업 10시");
    expect(plan.days[0].times.syd).toBe("10:30");
    const href = await page.locator(".day a.btn").first().getAttribute("href");
    expect(href).toContain("google.com/maps/dir/");
    expect(href).toContain("travelmode=transit");
  });

  test("출발일·일수 변경과 초기화", async ({ page }) => {
    await open(page);
    await tab(page, "plan");
    await page.fill("#startDate", "2026-12-10");
    await page.dispatchEvent("#startDate", "change");
    await page.click("#dayPlus");
    await expect(page.locator(".day")).toHaveCount(6);
    await expect(page.locator(".day .t").first()).toContainText("12/10");
    await page.click("#btnReset");
    expect((await savedPlan(page)).days).toHaveLength(5);
  });

  test("지도 클릭으로 내 장소 추가", async ({ page }) => {
    await open(page);
    page.__promptAnswer = "우리 숙소";
    await page.click("#btnAddMode");
    const b = await page.locator("#map").boundingBox();
    await page.mouse.click(b.x + b.width * 0.3, b.y + b.height * 0.7);
    await expect.poll(async () => (await savedPlan(page)).custom.map(c => c.name)).toContain("우리 숙소");
  });
});
