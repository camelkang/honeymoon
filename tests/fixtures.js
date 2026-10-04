// 외부 네트워크 없이 앱을 돌리기 위한 공통 목(mock): 지도 라이브러리·타일·구글 API·지오코딩
import { test as base, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const leaflet = p => fileURLToPath(new URL(`../node_modules/leaflet/dist/${p}`, import.meta.url));

// Google Maps JS를 흉내 내는 아주 작은 가짜 구현 (마커·선·정보창 기록)
export const GOOGLE_MOCK = `
window.__markers = []; window.__lines = [];
class MVC { constructor(o){ Object.assign(this, o || {}); this.l = {}; } addListener(n, f){ this.l[n] = f; } setMap(m){ this.map = m; } setZIndex(){} setOptions(){} }
window.google = { maps: {
  Map: class extends MVC { constructor(el, o){ super(o); window.__map = this; el.innerHTML = '<div style="background:#cde;height:100%">MOCK MAP</div>'; }
    panTo(){} getZoom(){ return 14; } setZoom(){} setCenter(c){ this.center = c; } fitBounds(){}
    getBounds(){ return { getNorthEast: () => ({ lat: () => -33.85, lng: () => 151.23 }), getSouthWest: () => ({ lat: () => -33.88, lng: () => 151.19 }) }; } },
  Marker: class extends MVC { constructor(o){ super(o); window.__markers.push(this); } },
  Polyline: class extends MVC { constructor(o){ super(o); window.__lines.push(this); } },
  InfoWindow: class extends MVC { setContent(n){ this.c = n; let d = document.getElementById('pop'); if (!d) { d = document.createElement('div'); d.id = 'pop'; d.style.cssText = 'position:fixed;right:10px;top:70px;width:300px;background:#fff;z-index:9999;padding:8px'; document.body.appendChild(d); } d.replaceChildren(n); } setPosition(){} open(){} close(){ const d = document.getElementById('pop'); if (d) d.replaceChildren(); } },
  LatLngBounds: class { extend(){} },
  Point: class { constructor(x, y){ this.x = x; this.y = y; } },
  SymbolPath: { CIRCLE: 0 },
}};
setTimeout(() => window.__gmInit(), 10);`;

export const PLACE = {
  id: "ChIJ_test", displayName: { text: "테스트 장소" }, formattedAddress: "Bennelong Point, Sydney NSW 2000",
  location: { latitude: -33.8568, longitude: 151.2153 }, rating: 4.7, userRatingCount: 91234,
  regularOpeningHours: { weekdayDescriptions: ["월요일: 오전 9:00~오후 5:00"] }, photos: [{ name: "places/x/photos/y" }],
  websiteUri: "https://example.com", primaryTypeDisplayName: { text: "공연장" },
};
export const ROUTE = {
  routes: [{ duration: "840s", distanceMeters: 2300, polyline: { encodedPolyline: "_p~iF~ps|U_ulLnnqC" },
    legs: [{ steps: [{ travelMode: "WALK" }, { travelMode: "TRANSIT", transitDetails: { transitLine: { nameShort: "T2", vehicle: { type: "HEAVY_RAIL" } } } }] }] }],
};
const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });

export const test = base.extend({
  // 구글 API 응답을 테스트마다 바꿀 수 있게 옵션으로 둠
  googleMode: ["ok", { option: true }],   // "ok" | "denied" | "authfail"
  calls: async ({}, use) => use({ places: [], routes: 0 }),
  context: async ({ context, googleMode, calls }, use) => {
    await context.route("**/cdnjs.cloudflare.com/**", r =>
      r.fulfill({ path: leaflet(r.request().url().endsWith(".css") ? "leaflet.css" : "leaflet.js"), headers: { "access-control-allow-origin": "*" } }));
    await context.route(/basemaps\.cartocdn\.com|arcgisonline\.com/, r => r.abort());
    await context.route("**/nominatim.openstreetmap.org/**", r => json(r, [{ lat: "-31.9523", lon: "115.8613", display_name: "Perth" }]));
    await context.route("**/maps.googleapis.com/**", r => r.fulfill({ contentType: "text/javascript",
      body: googleMode === "authfail" ? "setTimeout(() => window.gm_authFailure(), 10)" : GOOGLE_MOCK }));
    await context.route("**/places.googleapis.com/**", r => {
      const u = r.request().url();
      calls.places.push(u);
      if (u.includes("/media")) return r.abort();
      if (u.includes("searchText")) return json(r, { places: [PLACE, { ...PLACE, id: "ChIJ_other", displayName: { text: "다른 곳" } }] });
      return json(r, PLACE);
    });
    await context.route("**/routes.googleapis.com/**", r => {
      calls.routes++;
      if (googleMode === "denied") return json(r, { error: { message: "Routes API has not been used in project 1 before or it is disabled." } }, 403);
      return json(r, ROUTE);
    });
    await context.route("**/airbnb.co.kr/**", r => r.fulfill({ body: "ok" }));
    await use(context);
  },
  page: async ({ page }, use) => {
    const errors = [];
    page.on("pageerror", e => errors.push(e.message));
    page.on("dialog", d => d.accept(page.__promptAnswer ?? undefined));
    await use(page);
    expect(errors, "페이지 스크립트 오류가 없어야 함").toEqual([]);
  },
});

// 공통 동작
export const open = async (page, query = "") => { await page.goto("/index.html" + query); await page.waitForSelector("#list .place, #list .empty"); };
export const tab = (page, name) => page.click(`.tabs [data-tab=${name}]`);
export const savedPlan = page => page.evaluate(() => { const a = JSON.parse(localStorage.getItem("honeymoon-app-v2")); return a.plans[a.current]; });
export const savedApp = page => page.evaluate(() => JSON.parse(localStorage.getItem("honeymoon-app-v2")));
export const clickMap = async (page, fx = 0.5, fy = 0.5) => {
  const b = await page.locator("#map").boundingBox();
  await page.mouse.click(b.x + b.width * fx, b.y + b.height * fy);
};
export { expect };
