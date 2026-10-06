// 구글 지도 "저장한 목록" 공유 링크에서 장소 이름·좌표·주소를 모두 읽음 (네트워크가 되는 GitHub Actions에서 실행)
// 사용: node scripts/read-gmaps-list.mjs <공유 링크>
// 목록 화면이 내부적으로 부르는 JSON(entitylist/getlist)을 읽어 140곳처럼 긴 목록도 스크롤 없이 한 번에 가져옴
import { chromium } from "@playwright/test";

const url = process.argv[2];
if (!url) { console.error("공유 링크를 넘겨 주세요"); process.exit(1); }
const browser = await chromium.launch();
const page = await browser.newPage({ locale: "ko-KR" });
await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForTimeout(5000);
const final = page.url();
const id = (final.match(/!2s([^!]+)!3e3/) || [])[1];
console.log("FINAL_URL", final, "LIST_ID", id);
if (!id) { await browser.close(); process.exit(1); }

const api = `https://www.google.com/maps/preview/entitylist/getlist?authuser=0&hl=ko&gl=kr&pb=!1m4!1s${id}!2e1!3m1!1e1!2e2!3e2!4i500!16b1`;
const res = await page.request.get(api);
const text = (await res.text()).replace(/^\)\]\}'\s*/, "");
const data = JSON.parse(text);
// 응답 안에서 [null, null, 위도, 경도] 모양을 가진 장소 항목들을 찾음
const places = [];
const isCoord = a => Array.isArray(a) && a.length >= 4 && a[0] === null && a[1] === null && typeof a[2] === "number" && typeof a[3] === "number";
const strings = (x, out = []) => { if (typeof x === "string") out.push(x); else if (Array.isArray(x)) x.forEach(y => strings(y, out)); return out; };
function walk(x) {
  if (!Array.isArray(x)) return;
  // 장소 항목: [ ?, [.., .., 주소?, .., [null,null,lat,lng], ...], "이름", "메모", ... ]
  if (Array.isArray(x[1]) && typeof x[2] === "string" && x[1].some(isCoord)) {
    const c = x[1].find(isCoord);
    places.push({ name: x[2], note: typeof x[3] === "string" ? x[3] : "", lat: c[2], lng: c[3],
      info: strings(x[1]).filter(s => s.length < 160 && !/^0x|^https?:/.test(s)).slice(0, 6) });
    return;
  }
  x.forEach(walk);
}
walk(data);
console.log("COUNT", places.length);
for (const p of places) console.log("PLACE\t" + JSON.stringify(p));
await browser.close();
