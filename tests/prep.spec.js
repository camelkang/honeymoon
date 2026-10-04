import { test, expect, open, tab, savedPlan } from "./fixtures.js";

const setStart = (page, date) => page.fill('[data-prep="startDate"]', date);

test("D-day와 준비 체크리스트", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-01T09:00:00"));
  await open(page);
  await tab(page, "prep");
  await expect(page.locator(".dday-hero")).toContainText("출발일을 정하면");
  await setStart(page, "2026-12-10");
  await expect(page.locator(".dday-hero b")).toHaveText("D-39");
  await expect(page.locator("#startDate")).toHaveValue("2026-12-10");   // 일정 탭과 같은 출발일

  await page.click('[data-act="ckTemplate"]');
  const items = page.locator("#pane-prep .ck");
  const n = await items.count();
  expect(n).toBeGreaterThan(8);
  // 출발 90일 전까지 할 일인데 39일 남았으면 늦었다고 표시
  await expect(items.filter({ hasText: "여권 유효기간" })).toHaveClass(/late/);
  await items.filter({ hasText: "여권 유효기간" }).locator(".ck-box").click();
  await expect(items.filter({ hasText: "여권 유효기간" })).toHaveClass(/done/);
  await expect(items.filter({ hasText: "여권 유효기간" })).toContainText("나 완료");

  await page.fill(".ck-add [name=text]", "커플 사진 찍을 옷 챙기기");
  await page.selectOption(".ck-add [name=due]", "7");
  await page.press(".ck-add [name=text]", "Enter");
  await expect(page.locator(".ck", { hasText: "커플 사진" })).toBeVisible();
  await expect(page.locator(".ck-add [name=text]")).toBeFocused();
  await page.locator(".ck", { hasText: "커플 사진" }).locator(".ck-del").click();
  await expect(page.locator(".ck", { hasText: "커플 사진" })).toHaveCount(0);

  const plan = await savedPlan(page);
  expect(plan.checklist.length).toBe(n);
  expect(plan.checklist.filter(c => c.done).map(c => c.doneBy)).toEqual(["me"]);
  await expect(page.locator(".dday-meta")).toContainText(`준비 1/${n}`);
});

test("예산·지출 기록, 고치기, 삭제, 원화 환산", async ({ page }) => {
  await open(page);
  await tab(page, "prep");
  const add = async (amount, title, cat) => {
    await page.click('[data-act="addExp"]');
    await page.fill("#expForm [name=amount]", amount);
    await page.fill("#expForm [name=title]", title);
    if (cat) await page.selectOption("#expForm [name=cat]", cat);
    await page.click("#expForm button[type=submit]");
    await expect(page.locator("#expDlg")).toBeHidden();
  };
  // 금액 없이 저장하면 막힘
  await page.click('[data-act="addExp"]');
  await page.click("#expForm button[type=submit]");
  await expect(page.locator("#expDlg")).toBeVisible();
  await page.click("#expCancel");

  await add("1840", "항공권", "flight");
  await add("86.5", "오페라 바", "food");
  await expect(page.locator(".budget-n b")).toHaveText(/1,926\.5/);
  await page.click(".budget-set summary");
  await page.fill('[data-prep="budget"]', "2000");
  await page.press('[data-prep="budget"]', "Tab");
  await expect(page.locator(".budget-left")).toContainText("73.5");
  await page.fill('[data-prep="fx"]', "900");
  await page.press('[data-prep="fx"]', "Tab");
  await expect(page.locator("#pane-prep")).toContainText("≈ 1,733,850원");

  // 고치기: 줄을 누르면 같은 창이 열림
  await page.click(".exp >> text=오페라 바");
  await expect(page.locator("#expDlgTitle")).toHaveText("지출 고치기");
  await page.fill("#expForm [name=amount]", "200");
  await page.click("#expForm button[type=submit]");
  await expect(page.locator(".budget-left")).toContainText("40");
  await expect(page.locator(".budget-left")).toHaveClass(/over/);

  await page.click(".exp >> text=항공권");
  await page.click("#expDel");
  await expect(page.locator(".exp")).toHaveCount(1);
  const plan = await savedPlan(page);
  expect(plan.expenses.map(e => [e.title, e.amount, e.cat, e.paidBy])).toEqual([["오페라 바", 200, "food", "me"]]);
  expect([plan.budget, plan.fx, plan.currency]).toEqual([2000, 900, "AUD"]);

  await page.reload();
  await tab(page, "prep");
  await expect(page.locator(".exp")).toHaveCount(1);
});

test("여행 중에는 오늘 일정부터 열리고, 오늘 지출을 바로 기록", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-12-12T15:00:00"));
  await open(page);
  await tab(page, "plan");
  await page.fill("#startDate", "2026-12-10");
  await page.click("#btnSample");
  await expect(page.locator("#todayCard .today")).toContainText("Day 3");
  await expect(page.locator(".day.is-today .day-h")).toContainText("Day 3");
  await expect(page.locator("#todayCard a", { hasText: "길안내" })).toHaveAttribute("href", /google\.com\/maps\/dir\/.*destination=/);

  // 다시 열면 일정 탭이 먼저 (하루에 한 번)
  await tab(page, "places");
  await page.evaluate(() => localStorage.removeItem("today-opened"));
  await page.reload();
  await page.waitForFunction(() => window.__map && window.__map.loaded());
  await expect(page.locator('.tabs [data-tab="plan"]')).toHaveClass(/on/);
  await tab(page, "places");
  await page.reload();
  await page.waitForFunction(() => window.__map && window.__map.loaded());
  await expect(page.locator('.tabs [data-tab="places"]')).toHaveClass(/on/);

  await tab(page, "plan");
  await page.click('#todayCard [data-act="addExpToday"]');
  await expect(page.locator("#expForm [name=day]")).toHaveValue("2");
  await page.fill("#expForm [name=amount]", "42");
  await page.click("#expForm button[type=submit]");
  await expect(page.locator("#todayCard")).toContainText("오늘 AU$42");
  await tab(page, "prep");
  await expect(page.locator(".dday-hero b")).toHaveText("3일째");
});
