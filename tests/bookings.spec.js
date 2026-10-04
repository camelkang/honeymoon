import { test, expect, open, tab, savedPlan } from "./fixtures.js";

const addBooking = async (page, { type, title, date, time, endDate, endTime, code, link }) => {
  await page.click('#pane-prep [data-act="addBook"]');
  await page.locator(`#bookForm .type-opt:has([value=${type}]) span`).click();
  if (title) await page.fill("#bookForm [name=title]", title);
  if (date) await page.fill("#bookForm [name=date]", date);
  if (time) await page.fill("#bookForm [name=time]", time);
  if (endDate) await page.fill("#bookForm [name=endDate]", endDate);
  if (endTime) await page.fill("#bookForm [name=endTime]", endTime);
  if (code) await page.fill("#bookForm [name=code]", code);
  if (link) await page.fill("#bookForm [name=link]", link);
  await page.click("#bookForm button[type=submit]");
  await expect(page.locator("#bookDlg")).toBeHidden();
};

test("예약 정보: 모아 보기, 일정 카드에 표시, 고치기·삭제", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-12-11T08:00:00"));
  await open(page);
  await tab(page, "plan");
  await page.fill("#startDate", "2026-12-10");
  await tab(page, "prep");

  // 이름도 예약번호도 없으면 저장 안 됨
  await page.click('#pane-prep [data-act="addBook"]');
  await page.click("#bookForm button[type=submit]");
  await expect(page.locator("#bookDlg")).toBeVisible();
  await page.click("#bookCancel");

  await addBooking(page, { type: "stay", title: "서리힐스 로프트", date: "2026-12-11", time: "15:00", endDate: "2026-12-13", endTime: "10:00", code: "HM8K2Q", link: "airbnb.co.kr/trips/1" });
  await addBooking(page, { type: "flight", title: "KE401 인천 → 시드니", date: "2026-12-10", time: "09:30", code: "ABC123" });
  const rows = page.locator("#bookCard .bk");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("KE401");   // 날짜순
  await expect(rows.nth(1)).toContainText("12/11(금) 15:00 → 12/13(일) 10:00");
  await expect(rows.nth(1).locator("a")).toHaveAttribute("href", "https://airbnb.co.kr/trips/1");
  await rows.nth(0).locator(".bk-code").click();
  await expect(page.locator("#banner")).toContainText("ABC123");

  // 일정: 출발일·체크인·체크아웃 날에 표시, 오늘 카드에도
  await tab(page, "plan");
  const day = i => page.locator("#days .day").nth(i);
  await expect(day(0).locator(".bk-chip")).toContainText("09:30 출발 · KE401");
  await expect(day(1).locator(".bk-chip")).toContainText("15:00 체크인");
  await expect(day(3).locator(".bk-chip")).toContainText("10:00 체크아웃");
  await expect(day(2).locator(".bk-chip")).toHaveCount(0);
  await expect(page.locator("#todayCard .bk-chip")).toContainText("체크인");

  // 칩을 누르면 고치기
  await day(1).locator(".bk-chip").click();
  await expect(page.locator("#bookDlgTitle")).toHaveText("예약 고치기");
  await expect(page.locator("#bkStart")).toHaveText("체크인");
  await page.fill("#bookForm [name=time]", "16:00");
  await page.click("#bookForm button[type=submit]");
  await expect(day(1).locator(".bk-chip")).toContainText("16:00 체크인");

  await day(0).locator(".bk-chip").click();
  await page.click("#bookDel");
  await expect(day(0).locator(".bk-chip")).toHaveCount(0);
  const plan = await savedPlan(page);
  expect(plan.bookings.map(b => [b.type, b.code, b.time, b.by])).toEqual([["stay", "HM8K2Q", "16:00", "me"]]);
});
