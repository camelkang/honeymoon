// 구글 지도 "저장한 목록" 공유 링크를 열어 장소 이름·주소를 읽음 (네트워크가 되는 GitHub Actions에서 실행)
// 사용: node scripts/read-gmaps-list.mjs <공유 링크>
import { chromium } from "@playwright/test";

const url = process.argv[2];
if (!url) { console.error("공유 링크를 넘겨 주세요"); process.exit(1); }
const browser = await chromium.launch();
const page = await browser.newPage({ locale: "ko-KR", viewport: { width: 1280, height: 2000 } });
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForTimeout(6000);
console.log("FINAL_URL", page.url());
// 동의 화면이 나오면 수락
for (const t of ["모두 수락", "Accept all", "모두 거부", "Reject all"]) {
  const b = page.getByRole("button", { name: t });
  if (await b.count()) { await b.first().click().catch(() => {}); await page.waitForTimeout(4000); break; }
}
// 목록은 스크롤해야 더 불러옴
const seen = new Map();
for (let round = 0; round < 40; round++) {
  const items = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('div[role="main"] button, div[role="main"] a, div[role="feed"] > div, .fontHeadlineSmall')) {
      const t = (el.innerText || "").trim();
      if (t && t.length < 300) out.push(t);
    }
    return out;
  });
  for (const t of items) if (!seen.has(t)) seen.set(t, round);
  const moved = await page.evaluate(() => {
    const scroller = [...document.querySelectorAll("div")].find(d => d.scrollHeight > d.clientHeight + 50 && getComputedStyle(d).overflowY !== "visible" && d.querySelector(".fontHeadlineSmall"));
    if (!scroller) return false;
    const before = scroller.scrollTop; scroller.scrollTop += 1500; return scroller.scrollTop !== before;
  });
  await page.waitForTimeout(1200);
  if (!moved && round > 3) break;
}
console.log("=== HEADLINES ===");
const heads = await page.$$eval(".fontHeadlineSmall", els => els.map(e => e.innerText.trim()).filter(Boolean));
console.log(JSON.stringify([...new Set(heads)], null, 1));
console.log("=== MAIN TEXT ===");
console.log((await page.evaluate(() => (document.querySelector('div[role="main"]') || document.body).innerText)).slice(0, 20000));
await page.screenshot({ path: "gmaps-list.png" });
await browser.close();
