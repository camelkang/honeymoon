// 외부 네트워크 없이 앱을 돌리기 위한 공통 목(mock): 지도 스타일·타일, 구글 API, 지오코딩
import { test as base, expect } from "@playwright/test";

// 지도 스타일 대신 쓰는 빈 배경 스타일 (테스트 환경엔 외부 지도 타일이 없음)
const BLANK_STYLE = { version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#e8e6df" } }] };

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
const BAD_KEY = { error: { message: "API key not valid. Please pass a valid API key.", status: "INVALID_ARGUMENT" } };
const json = (route, body, status = 200) =>
  route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });

// 외부 서비스(지도 타일·구글·지오코딩)를 가짜로 대체. 여러 브라우저 컨텍스트에서 재사용
export async function mockNetwork(context, { googleMode = "ok", calls = { places: [], routes: 0 } } = {}) {
  // 처음 시작 안내는 따로 테스트(?welcome)하고, 다른 테스트에선 건너뜀
  await context.addInitScript(() => { if (!location.search.includes("welcome")) localStorage.setItem("onboarded", "1"); });
  // Playwright는 나중에 등록한 route가 먼저 적용됨 → 전체 차단을 먼저, 스타일 응답을 나중에
  await context.route("**/tiles.openfreemap.org/**", r => r.abort());
  await context.route("**/tiles.openfreemap.org/styles/**", r => json(r, BLANK_STYLE));
  await context.route("**/nominatim.openstreetmap.org/**", r => json(r, [{ lat: "-31.9523", lon: "115.8613", display_name: "Perth" }]));
  await context.route("**/maps.googleapis.com/**", r => r.abort());   // 구글 지도 JS는 더 이상 쓰지 않음
  await context.route("**/places.googleapis.com/**", r => {
    const u = r.request().url();
    calls.places.push(u);
    if (googleMode === "badkey") return json(r, BAD_KEY, 400);
    if (u.includes("/media")) return r.abort();
    if (u.includes("searchText")) return json(r, { places: [PLACE, { ...PLACE, id: "ChIJ_other", displayName: { text: "다른 곳" } }] });
    return json(r, PLACE);
  });
  await context.route("**/routes.googleapis.com/**", r => {
    calls.routes++;
    if (googleMode === "badkey") return json(r, BAD_KEY, 400);
    if (googleMode === "denied") return json(r, { error: { message: "Routes API has not been used in project 1 before or it is disabled." } }, 403);
    return json(r, ROUTE);
  });
  await context.route("**/airbnb.co.kr/**", r => r.fulfill({ body: "ok" }));
  // 환율·날씨 (무료 공개 API)
  await context.route("**/open.er-api.com/**", r => json(r, { result: "success", time_last_update_utc: "Sun, 04 Oct 2026 00:00:01 +0000", rates: { KRW: 905, USD: 0.65 } }));
  await context.route("**/api.frankfurter.app/**", r => r.abort());
  // 날씨: 요청한 날짜마다 같은 값 (예보는 맑음 24°/17° 비 40%, 작년 자료는 비 21°/15°)
  const weather = (r, past) => {
    const u = new URL(r.request().url()), out = [];
    for (let d = new Date(u.searchParams.get("start_date") + "T00:00:00Z"); d <= new Date(u.searchParams.get("end_date") + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
    calls.weather = (calls.weather || 0) + 1;
    return json(r, { daily: { time: out, weather_code: out.map(() => past ? 61 : 0), temperature_2m_max: out.map(() => past ? 21 : 24.4),
      temperature_2m_min: out.map(() => past ? 15 : 16.6), ...(past ? {} : { precipitation_probability_max: out.map(() => 40) }) } });
  };
  await context.route("**/api.open-meteo.com/**", r => weather(r, false));
  await context.route("**/archive-api.open-meteo.com/**", r => weather(r, true));
}

export const test = base.extend({
  // 구글 API 응답을 테스트마다 바꿀 수 있게 옵션으로 둠
  googleMode: ["ok", { option: true }],   // "ok" | "denied" | "badkey"
  calls: async ({}, use) => use({ places: [], routes: 0 }),
  context: async ({ context, googleMode, calls }, use) => {
    await mockNetwork(context, { googleMode, calls });
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
export const open = async (page, query = "") => {
  await page.goto("/index.html" + query);
  await page.waitForSelector("#list .place, #list .empty");
  await page.waitForFunction(() => window.__map && window.__map.loaded());   // 지도 스타일 로드 완료
};
export const tab = (page, name) => page.click(`.tabs [data-tab=${name}]`);
export const savedPlan = page => page.evaluate(() => { const a = JSON.parse(localStorage.getItem("honeymoon-app-v2")); return a.plans[a.current]; });
export const savedApp = page => page.evaluate(() => JSON.parse(localStorage.getItem("honeymoon-app-v2")));
// 지도의 빈 곳(핀·버튼이 없는 곳)을 클릭. fx, fy 근처부터 찾아봄
export const clickMap = async (page, fx = 0.5, fy = 0.5) => {
  const b = await page.locator("#map").boundingBox();
  const pt = await page.evaluate(({ b, fx, fy }) => {
    for (let r = 0; r < 0.4; r += 0.03) for (let a = 0; a < 6.28; a += 0.7) {
      const x = b.x + b.width * (fx + r * Math.cos(a)), y = b.y + b.height * (fy + r * Math.sin(a));
      const el = document.elementFromPoint(x, y);
      if (el && el.classList.contains("maplibregl-canvas")) return { x, y };
    }
    return { x: b.x + b.width * fx, y: b.y + b.height * fy };
  }, { b, fx, fy });
  await page.mouse.click(pt.x, pt.y);
};
// 지도 위 가게·명소(POI) 아이콘 클릭 흉내: 해당 지점에 POI 하나가 그려져 있다고 가정
export const clickPoi = (page, poi) => page.evaluate(({ name, lat, lng }) => {
  const map = window.__map;
  map.queryRenderedFeatures = () => [{ sourceLayer: "poi", properties: { name }, geometry: { type: "Point", coordinates: [lng, lat] } }];
  map.fire("click", { lngLat: { lat, lng }, point: map.project([lng, lat]),
    originalEvent: new MouseEvent("click"), target: map, type: "click" });
}, poi);
export { expect };
