import { test, expect, open, tab, savedPlan } from "./fixtures.js";

const topCard = page => page.locator("#pickDeck .pcard:not(.back)");
const topId = page => topCard(page).getAttribute("data-id");
const myVotes = async page => Object.fromEntries(Object.entries((await savedPlan(page)).votes || {}).map(([id, v]) => [id, v.me]));

test("함께 고르기: 버튼·키보드·스와이프로 고르고 모아 보기", async ({ page }) => {
  await open(page);
  await tab(page, "pick");
  const first = await topId(page);
  await page.click(".pbtn.like");
  await expect.poll(() => topId(page)).not.toBe(first);

  const second = await topId(page);
  await page.keyboard.press("ArrowLeft");   // 패스
  await expect.poll(() => topId(page)).not.toBe(second);

  // 카드를 오른쪽으로 끌어 넘기면 좋아요
  const third = await topId(page);
  const b = await topCard(page).boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(b.x + b.width / 2 + i * 30, b.y + b.height / 2);
  await page.mouse.up();
  await expect.poll(() => topId(page)).not.toBe(third);

  await expect.poll(() => myVotes(page)).toEqual({ [first]: 1, [second]: -1, [third]: 1 });

  // 모아 보기: 내가 좋아요 2곳, 짝꿍 없으면 안내
  await page.click("#pickSeg [data-pick=matches]");
  await expect(page.locator("#pickMatches .mrow")).toHaveCount(2);
  await expect(page.locator("#pickMatches")).toContainText("짝꿍을 연결하면");

  // 둘러보기의 "내가 좋아요" 칩으로 좋아한 곳만 보기, 지도 핀에도 하트
  await tab(page, "places");
  await page.click('#chips [data-like="liked"]');
  await expect(page.locator("#list .place")).toHaveCount(2);
  await expect(page.locator(".pin-heart.mine")).toHaveCount(2);
  await page.click('#chips [data-like="liked"]');
  expect(await page.locator("#list .place").count()).toBeGreaterThan(2);
});

test("카드에서 바로 일정에 넣으면 좋아요도 함께 남음", async ({ page }) => {
  await open(page);
  await tab(page, "pick");
  const id = await topId(page);
  await page.click(".pbtn.add");
  await expect(page.locator("#dayDlg")).toBeVisible();
  await page.click('#dayDlg [data-day="1"]');
  await expect(page.locator("#dayDlg")).toBeHidden();
  const plan = await savedPlan(page);
  expect(plan.days[1].stops).toContain(id);
  expect(plan.votes[id].me).toBe(1);
  await expect.poll(() => topId(page)).not.toBe(id);
});

test("지도 팝업의 하트로 좋아요 토글", async ({ page }) => {
  await open(page);
  await page.click("#list .place >> nth=0");
  const btn = page.locator(".maplibregl-popup .heart-btn");
  await btn.click();
  await expect.poll(async () => Object.values(await myVotes(page))).toEqual([1]);
  await page.locator(".maplibregl-popup .heart-btn").click();
  await expect.poll(async () => Object.values(await myVotes(page)).filter(v => v === 1)).toEqual([]);
});

test("휴대폰: 아래 시트를 끌어 높이를 바꾸고, 함께 고르기는 크게 열림", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  const h = () => page.locator("#sheet").evaluate(e => e.getBoundingClientRect().height);
  const half = await h();
  const hb = await page.locator("#sheetHandle").boundingBox();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(hb.x + hb.width / 2, hb.y + 300, { steps: 5 });
  await page.mouse.up();
  await expect.poll(h).toBeLessThan(half - 100);
  await tab(page, "pick");
  await expect.poll(h).toBeGreaterThan(half + 100);
  await expect(page.locator(".pbtn.like")).toBeInViewport();
});
