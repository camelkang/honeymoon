// 플레이스토어용 휴대폰 스크린샷 (1080×1920). 실제 지도가 필요해서 GitHub Actions에서 실행
// (Actions → "Store screenshots" → Run workflow). 결과는 store/screenshots/에 커밋됨
import { test, expect } from "@playwright/test";

const OUT = "store/screenshots/";
const ready = page => page.waitForFunction(() => window.__map && window.__map.loaded() && window.__map.areTilesLoaded(), null, { timeout: 60_000 });
const shot = async (page, name) => { await page.waitForTimeout(1500); await ready(page); await page.screenshot({ path: OUT + name }); };

test("store screenshots", async ({ page }) => {
  test.setTimeout(300_000);
  if (process.env.MOCK_MAP) {   // 네트워크가 막힌 곳에서 순서만 확인할 때
    await page.route("**/tiles.openfreemap.org/**", r => r.abort());
    await page.route("**/tiles.openfreemap.org/styles/**", r => r.fulfill({ contentType: "application/json",
      body: JSON.stringify({ version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#e8e6df" } }] }) }));
  }
  await page.clock.setFixedTime(new Date("2026-11-20T10:00:00"));
  await page.goto("/index.html?nokey=1");
  await ready(page);

  // 준비: 추천 일정 + 출발일 + 몇 가지 좋아요
  await page.click(".tabs [data-tab=plan]");
  await page.fill("#startDate", "2026-12-10");
  await page.click("#btnSample");
  await page.click(".tabs [data-tab=places]");
  await shot(page, "1-places.png");

  await page.click(".tabs [data-tab=pick]");
  for (let i = 0; i < 3; i++) { await page.click(".pbtn.like"); await page.waitForTimeout(400); }
  await page.click(".pbtn.pass"); await page.waitForTimeout(400);
  await shot(page, "2-pick.png");

  await page.click(".tabs [data-tab=plan]");
  await page.click('[data-focus="0"]');
  await page.evaluate(() => { const s = document.getElementById("sheet"); s.style.setProperty("--sheet-h", Math.round(innerHeight * 0.48) + "px"); });
  await shot(page, "3-plan.png");

  await page.click(".tabs [data-tab=prep]");
  const add = async (amount, title, cat) => {
    await page.click('[data-act="addExp"]');
    await page.fill("#expForm [name=amount]", amount);
    await page.fill("#expForm [name=title]", title);
    await page.selectOption("#expForm [name=cat]", cat);
    await page.click("#expForm button[type=submit]");
  };
  await add("1840", "왕복 항공권", "flight");
  await add("1290", "서리힐스 에어비앤비 5박", "stay");
  await add("189", "오페라 하우스 공연", "fun");
  await page.click(".budget-set summary");
  await page.fill('[data-prep="budget"]', "6000"); await page.press('[data-prep="budget"]', "Tab");
  await page.fill('[data-prep="fx"]', "905"); await page.press('[data-prep="fx"]', "Tab");
  await page.click(".budget-set summary");
  await page.click('[data-act="ckTemplate"]');
  for (const t of ["여권 유효기간", "항공권 예약", "숙소 예약", "ETA"]) await page.locator(".ck", { hasText: t }).locator(".ck-box").click();
  await page.evaluate(() => document.getElementById("pane-prep").scrollTo(0, 0));
  await shot(page, "4-prep.png");

  await page.click(".tabs [data-tab=stays]");
  await page.click(".tabs [data-tab=places]");
  await page.click("#list .place >> nth=0");
  await shot(page, "5-place.png");
  await expect(page.locator(".maplibregl-popup")).toBeVisible();
});
