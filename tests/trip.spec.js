import { test, expect, open, tab, savedApp } from "./fixtures.js";

const labels = page => page.locator("#days .day .day-h .t").evaluateAll(els => els.map(e => e.childNodes[0].textContent.trim()));

async function makeTrip(page) {
  await tab(page, "plan");
  await page.click('#tripBar [data-trip="edit"]');
  const dlg = page.locator("#tripDlg");
  await dlg.locator('[data-tf="start"]').fill("2026-11-15");
  await dlg.locator('[data-tf="end"]').fill("2026-11-24");
  await dlg.locator('[data-tf="base"]').selectOption("sydney");
  await dlg.locator('[data-trip="addStop"]').click();
  await dlg.locator('[data-ts="0|city"]').selectOption("cairns");
  await dlg.locator('[data-ts="0|from"]').fill("2026-11-17");
  await dlg.locator('[data-ts="0|to"]').fill("2026-11-19");
  await expect(dlg.locator(".trip-preview")).toContainText("10일");
  await expect(dlg.locator(".trip-preview")).toContainText("시드니 11/15~16");
  await expect(dlg.locator(".trip-preview")).toContainText("케언즈 11/17~19");
  await expect(dlg.locator(".trip-preview")).toContainText("시드니 11/20~24");
  await page.click("#tripSave");
  await expect(dlg).toBeHidden();
}

test("여러 도시 일정표: 시드니 11/15~24 중 17~19일은 케언즈", async ({ page }) => {
  test.setTimeout(60_000);
  await page.clock.setFixedTime(new Date("2026-10-05T10:00:00"));
  await open(page);
  // 일정표를 만들기 전에 시드니에 담아 둔 장소는 그대로 남아야 함
  await tab(page, "plan");
  await page.click("#btnSample");
  const firstStops = (await savedApp(page)).plans.sydney.days[0].stops;
  await makeTrip(page);

  // 시드니: 7일 (15·16·20~24), Day 번호는 전체 여행 기준
  await expect(page.locator("#tripBar .trip-seg")).toHaveCount(3);
  await expect(page.locator("#startDate")).toBeHidden();
  await expect.poll(() => labels(page)).toEqual([
    "Day 1 · 11/15(일)", "Day 2 · 11/16(월)", "Day 6 · 11/20(금)", "Day 7 · 11/21(토)", "Day 8 · 11/22(일)", "Day 9 · 11/23(월)", "Day 10 · 11/24(화)"]);
  expect((await savedApp(page)).plans.sydney.days[0].stops).toEqual(firstStops);
  await expect(page.locator("#citySel option[value=sydney]")).toContainText("11/15~16, 11/20~24");

  // 케언즈로 가는 항공권은 시드니에서 넣어도 케언즈 첫날에 보임
  await tab(page, "prep");
  await expect(page.locator(".dday-hero b")).toHaveText("D-41");
  await expect(page.locator(".dday-meta")).toContainText("10일");
  await expect(page.locator(".dday-meta")).toContainText("시드니 → 케언즈 → 시드니");
  await page.click('#pane-prep [data-act="addBook"]');
  await page.fill("#bookForm [name=title]", "QF702 시드니 → 케언즈");
  await page.fill("#bookForm [name=date]", "2026-11-17");
  await page.fill("#bookForm [name=time]", "09:10");
  await page.click("#bookForm button[type=submit]");

  await tab(page, "plan");
  await page.locator('#tripBar [data-tripcity="cairns"]').click();
  await expect(page.locator("#citySel")).toHaveValue("cairns");
  await expect.poll(() => labels(page)).toEqual(["Day 3 · 11/17(화)", "Day 4 · 11/18(수)", "Day 5 · 11/19(목)"]);
  await expect(page.locator("#days .day").first().locator(".bk-chip")).toContainText("09:10 출발 · QF702");
  // 날짜가 정해진 도시는 추천 일정도 날짜 칸에 맞춰 채움
  await page.click("#btnSample");
  const cairns = (await savedApp(page)).plans.cairns;
  expect(cairns.days.map(d => d.date)).toEqual(["2026-11-17", "2026-11-18", "2026-11-19"]);
  expect(cairns.days[0].stops.length).toBeGreaterThan(0);

  // 날짜 바꾸기: 케언즈를 하루 늘려도 같은 날짜 내용은 그대로
  await page.click('#tripBar [data-trip="edit"]');
  await page.locator('#tripDlg [data-ts="0|to"]').fill("2026-11-20");
  await page.click("#tripSave");
  const after = (await savedApp(page)).plans;
  expect(after.cairns.days.map(d => d.date)).toEqual(["2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"]);
  expect(after.cairns.days[0].stops).toEqual(cairns.days[0].stops);
  // 시드니 11/20에 담아 둔 장소는 지워지지 않고 "날짜 미정" 칸으로 남음
  expect(after.sydney.days.map(d => d.date)).toEqual(["2026-11-15", "2026-11-16", "2026-11-21", "2026-11-22", "2026-11-23", "2026-11-24", ""]);
  expect(after.sydney.days.at(-1).stops.length).toBeGreaterThan(0);
  await page.locator('#tripBar [data-tripcity="sydney"]').first().click();
  await expect.poll(async () => (await labels(page)).at(-1)).toBe("날짜 미정");
  expect(after.sydney.days[0].stops).toEqual(firstStops);
});

test("여행 중에는 오늘 머무는 도시로 열리고, 일정표를 없애면 원래대로", async ({ page }) => {
  test.setTimeout(60_000);
  await page.clock.setFixedTime(new Date("2026-11-18T09:00:00"));
  await open(page);
  await makeTrip(page);
  await page.evaluate(() => localStorage.removeItem("today-opened"));
  await page.reload();
  await page.waitForFunction(() => window.__map && window.__map.loaded(), null, { polling: 100 });
  await expect(page.locator("#citySel")).toHaveValue("cairns");
  await expect(page.locator('.tabs [data-tab="plan"]')).toHaveClass(/on/);
  await expect(page.locator("#todayCard .today")).toContainText("Day 4");
  await tab(page, "prep");
  await expect(page.locator(".dday-hero b")).toHaveText("4일째");

  await tab(page, "plan");
  await page.click('#tripBar [data-trip="edit"]');
  await page.click("#tripDel");
  await expect(page.locator("#tripBar .trip-add")).toBeVisible();
  await expect(page.locator("#startDate")).toBeVisible();
  const a = await savedApp(page);
  expect(a.trip).toBeNull();
  expect(a.plans.cairns.days.every(d => !("date" in d))).toBe(true);
  expect(a.plans.cairns.startDate).toBe("2026-11-17");
});
