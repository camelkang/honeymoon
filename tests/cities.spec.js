import { readFileSync } from "node:fs";
import { test, expect, open, tab, savedApp } from "./fixtures.js";

const optionTexts = page => page.$$eval("#citySel option", os => os.map(o => o.textContent));

test("예전(v1) 시드니 저장분을 v2로 옮김", async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem("seeded")) return;
    localStorage.setItem("seeded", "1");
    localStorage.setItem("sydney-honeymoon-v1", JSON.stringify({ startDate: "2026-12-10", days: [{ stops: ["opera"], note: "old note" }],
      custom: [{ id: "cx", cat: "mine", name: "우리 숙소", lat: -33.87, lng: 151.2 }], cats: ["sight", "mine"] }));
  });
  await open(page);
  const a = await savedApp(page);
  expect(a.plans.sydney.days[0].note).toBe("old note");
  expect(a.plans.sydney.custom[0].name).toBe("우리 숙소");
  expect(a.plans.sydney.cats).toContain("stay");
  expect((await optionTexts(page))[0]).toContain("12/10");
});

test("도시마다 장소·일정이 따로 저장됨", async ({ page }) => {
  await open(page);
  await page.selectOption("#citySel", "melbourne");
  await expect(page).toHaveTitle(/멜버른/);
  await expect(page.locator("#list .place").first()).toContainText("페더레이션");
  await tab(page, "plan");
  await page.click("#btnSample");
  await page.selectOption("#citySel", "sydney");
  await tab(page, "plan");
  await expect(page.locator(".day .empty").first()).toBeVisible();
  const a = await savedApp(page);
  expect(a.plans.melbourne.days[0].stops[0]).toBe("m_mel");
  expect(a.plans.sydney.days.every(d => d.stops.length === 0)).toBe(true);
});

test("다른 도시 추가·삭제, 전체 내보내기·가져오기", async ({ page }) => {
  await open(page);
  page.__promptAnswer = "퍼스";
  await page.selectOption("#citySel", "__add");
  await expect(page).toHaveTitle(/퍼스/);
  await expect(page.locator("#list .empty")).toContainText("추천 장소가 아직 없어요");
  await expect(page.locator("#btnCityDel")).toBeVisible();

  await tab(page, "plan");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#btnExport")]);
  const file = await dl.path();
  const exported = JSON.parse(readFileSync(file, "utf8"));
  expect(exported.myCities.map(c => c.name)).toEqual(["퍼스"]);

  await page.click("#btnCityDel");
  expect((await optionTexts(page)).join()).not.toContain("퍼스");
  await page.setInputFiles("#importFile", file);
  await expect(page).toHaveTitle(/퍼스/);
});

test("기본 도시는 삭제 버튼이 숨겨짐", async ({ page }) => {
  await open(page);
  await expect(page.locator("#btnCityDel")).toBeHidden();
});

test("새 여행지: 그 나라 통화와 맞춤 준비물로 시작", async ({ page }) => {
  await open(page);
  await page.selectOption("#citySel", "paris");
  await expect(page).toHaveTitle(/파리/);
  await expect(page.locator("#list .place").first()).toBeVisible();
  await page.click(".tabs [data-tab=prep]");
  await page.click('[data-act="addExp"]');
  await expect(page.locator("#expCur")).toHaveText("EUR");
  await page.click("#expCancel");
  await page.click('[data-act="ckTemplate"]');
  await expect(page.locator("#pane-prep .ck", { hasText: "ETIAS" })).toHaveCount(1);
  await expect(page.locator("#pane-prep .ck", { hasText: "C·E 타입" })).toHaveCount(1);
  await page.selectOption("#citySel", "tokyo");
  await page.click('[data-act="ckTemplate"]');
  await expect(page.locator("#pane-prep .ck", { hasText: "Visit Japan Web" })).toHaveCount(1);
});
