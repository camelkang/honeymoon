import { test, expect, open, tab, savedPlan } from "./fixtures.js";

const L = "#pane-ledger";
async function add(page, amount, title, { cat, cur, pay } = {}) {
  await page.click(`${L} [data-act="addExp"] >> nth=0`);
  await page.fill("#expForm [name=amount]", amount);
  await page.fill("#expForm [name=title]", title);
  if (cat) await page.selectOption("#expForm [name=cat]", cat);
  if (cur) await page.click(`#expForm .seg-opt:has([name=cur][value=${cur}])`);
  if (pay) await page.click(`#expForm .seg-opt:has([name=pay][value=${pay}])`);
  await page.click("#expForm button[type=submit]");
  await expect(page.locator("#expDlg")).toBeHidden();
}

test("가계부: 지출 기록, 고치기, 삭제, 예산과 원화 환산", async ({ page }) => {
  await open(page);
  await tab(page, "ledger");
  await expect(page.locator(L)).toContainText("첫 지출 기록");
  // 금액 없이 저장하면 막힘
  await page.click(`${L} [data-act="addExp"] >> nth=0`);
  await page.click("#expForm button[type=submit]");
  await expect(page.locator("#expDlg")).toBeVisible();
  await page.click("#expCancel");

  await add(page, "1840", "항공권", { cat: "flight" });
  await add(page, "86.5", "오페라 바", { cat: "food" });
  await expect(page.locator(`${L} .budget-n b`)).toHaveText(/1,926\.5/);
  await page.click(`${L} .budget-set summary`);
  await page.fill(`${L} [data-prep="budget"]`, "2000");
  await page.press(`${L} [data-prep="budget"]`, "Tab");
  await expect(page.locator(`${L} .budget-left`)).toContainText("73.5");
  // 환율을 안 넣으면 오늘 환율(가짜 API: 905원)로 자동 환산
  await expect(page.locator(L)).toContainText("≈ 1,743,483원");
  await expect(page.locator(`${L} .fx-src`)).toHaveText("오늘 환율 1 AUD = 905원");
  await page.fill(`${L} [data-prep="fx"]`, "900");
  await page.press(`${L} [data-prep="fx"]`, "Tab");
  await expect(page.locator(L)).toContainText("≈ 1,733,850원");
  await expect(page.locator(`${L} .fx-src`)).toHaveText("직접 넣은 환율 1 AUD = 900원");

  // 고치기: 줄을 누르면 같은 창이 열림
  await page.click(`${L} .exp >> text=오페라 바`);
  await expect(page.locator("#expDlgTitle")).toHaveText("지출 고치기");
  await page.fill("#expForm [name=amount]", "200");
  await page.click("#expForm button[type=submit]");
  await expect(page.locator(`${L} .budget-left`)).toContainText("40");
  await expect(page.locator(`${L} .budget-left`)).toHaveClass(/over/);

  await page.click(`${L} .exp >> text=항공권`);
  await page.click("#expDel");
  await expect(page.locator(`${L} .exp`)).toHaveCount(1);
  const plan = await savedPlan(page);
  expect(plan.expenses.map(e => [e.title, e.amount, e.cat, e.paidBy, e.for, e.pay])).toEqual([["오페라 바", 200, "food", "me", "both", "card"]]);
  expect([plan.budget, plan.fx, plan.currency]).toEqual([2000, 900, "AUD"]);

  // 준비 탭에는 요약만, 누르면 가계부로
  await tab(page, "prep");
  await expect(page.locator("#pane-prep .ledger-mini .budget-n b")).toHaveText(/200/);
  await page.click('#pane-prep [data-act="openLedger"]');
  await expect(page.locator('.tabs [data-tab="ledger"]')).toHaveClass(/on/);

  await page.reload();
  await tab(page, "ledger");
  await expect(page.locator(`${L} .exp`)).toHaveCount(1);
});

test("가계부: 원화로 적은 지출, 날짜별 묶음, 분류 필터, 현금, CSV", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-12-11T12:00:00"));
  await open(page);
  await tab(page, "plan");
  await page.fill("#startDate", "2026-12-10");
  await tab(page, "ledger");

  // 여행 전에 원화로 낸 항공권 → 905원 환율로 AUD 환산해서 합계에
  await page.click(`${L} [data-act="addExp"] >> nth=0`);
  await expect(page.locator("#expCur")).toHaveText("AUD");
  await page.click("#expForm .seg-opt:has([name=cur][value=KRW])");
  await expect(page.locator("#expCur")).toHaveText("KRW");
  await page.fill("#expForm [name=amount]", "905000");
  await page.fill("#expForm [name=title]", "항공권");
  await page.selectOption("#expForm [name=cat]", "flight");
  await page.selectOption("#expForm [name=day]", "");
  await page.click("#expForm button[type=submit]");
  await expect(page.locator(`${L} .exp`, { hasText: "항공권" })).toContainText("≈ AU$1,000");
  await expect(page.locator(`${L} .budget-n b`)).toHaveText(/1,000/);

  // 오늘(Day 2) 지출: 기본 날짜가 오늘
  await add(page, "30", "커피", { cat: "food", pay: "cash" });
  await add(page, "70", "페리", { cat: "move" });
  await expect(page.locator(`${L} .budget-n b`)).toHaveText(/1,100/);
  const today = page.locator(`${L} .exp-day.is-today`);
  await expect(today.locator(".exp-day-h")).toContainText("Day 2");
  await expect(today.locator(".exp-day-h .sub")).toHaveText(/100/);
  await expect(page.locator(`${L} .exp-day`).last()).toContainText("여행 전");
  await expect(page.locator(`${L} .ledger-stats`)).toContainText("현금으로 쓴 돈");
  await expect(page.locator(`${L} .ledger-stats`)).toContainText("AU$30");

  // 분류 필터
  await page.click(`${L} [data-fcat="food"]`);
  await expect(page.locator(`${L} .exp`)).toHaveCount(1);
  await expect(page.locator(`${L} .filter-sum`)).toContainText("AU$30");
  await page.click(`${L} [data-fcat="all"]`);
  await expect(page.locator(`${L} .exp`)).toHaveCount(3);

  const plan = await savedPlan(page);
  const flight = plan.expenses.find(e => e.title === "항공권");
  expect([flight.cur, flight.amount, flight.day]).toEqual(["KRW", 905000, null]);
  expect(plan.expenses.find(e => e.title === "커피").cur).toBeUndefined();

  const [dl] = await Promise.all([page.waitForEvent("download"), page.click(`${L} [data-act="expCsv"]`)]);
  expect(dl.suggestedFilename()).toBe("duriseo-ledger-sydney-2026-12-11.csv");
  const csv = await (await import("node:fs/promises")).readFile(await dl.path(), "utf8");
  expect(csv).toContain("항공,항공권,905000,KRW,1000,905000,나,같이,카드");
  expect(csv).toContain("2026-12-11,2,식비,커피,30,AUD,30,27150,나,같이,현금");
});
