import { test, expect, savedPlan, savedApp } from "./fixtures.js";

const openFresh = async (page, query = "?welcome") => {
  await page.goto("/index.html" + query);
  await page.waitForFunction(() => window.__map && window.__map.loaded());
};

test("처음 열면 도시 → 날짜 → 짝꿍 안내 후 함께 고르기부터 시작", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFresh(page);
  const dlg = page.locator("#onboard");
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText("어디로 떠나요?");
  await dlg.locator('[data-city="melbourne"]').click();
  await expect(dlg).toContainText("언제 떠나요?");
  await expect(page.locator("#citySel")).toHaveValue("melbourne");
  await expect(dlg.locator('[data-ob="next"]')).toHaveText("날짜는 나중에");
  await dlg.locator("#obDate").fill("2027-03-02");
  await expect(dlg.locator('[data-ob="next"]')).toHaveText("다음");
  const before = +(await dlg.locator("#obDays").textContent());
  await dlg.locator('[data-days="1"]').click();
  await dlg.locator('[data-ob="next"]').click();
  await expect(dlg).toContainText("짝꿍과 함께 쓸까요?");
  await dlg.locator('[data-ob="solo"]').click();
  await expect(dlg).toBeHidden();
  await expect(page.locator('.tabs [data-tab="pick"]')).toHaveClass(/on/);

  const plan = await savedPlan(page);
  expect(plan.startDate).toBe("2027-03-02");
  expect(plan.days.length).toBe(before + 1);
  expect(plan.days[0].stops.length).toBeGreaterThan(0);   // 추천 일정으로 시작
  expect((await savedApp(page)).current).toBe("melbourne");

  await page.reload();
  await page.waitForFunction(() => window.__map && window.__map.loaded());
  await expect(dlg).toBeHidden();   // 한 번만
});

test("건너뛰기, 그리고 짝꿍 초대를 고르면 계정 창이 열림", async ({ page }) => {
  await openFresh(page);
  await page.click('#onboard [data-ob="skip"]');
  await expect(page.locator("#onboard")).toBeHidden();
  await page.evaluate(() => localStorage.removeItem("onboarded"));
  await openFresh(page);
  await page.click('#onboard [data-ob="next"]');
  await page.click('#onboard [data-ob="back"]');
  await expect(page.locator("#onboard")).toContainText("어디로 떠나요?");
  await page.click('#onboard [data-ob="next"]');
  await page.uncheck("#obSample");
  await page.click('#onboard [data-ob="next"]');
  await page.click('#onboard [data-ob="invite"]');
  await expect(page.locator("#accountDlg")).toBeVisible();
  expect((await savedPlan(page)).days.every(d => !d.stops.length)).toBe(true);
});

test("이미 쓰던 사람이나 초대 링크로 들어온 사람에겐 안 보임", async ({ page }) => {
  await openFresh(page, "?welcome&join=ABC123");
  await expect(page.locator("#onboard")).toBeHidden();
});
