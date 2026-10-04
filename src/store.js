import { CATS, CITIES } from "./data.js";

/* ============================== 상태 (도시별) ============================== */
// 도시마다 일정·내 장소·숙소 후보를 따로 저장. 예전 시드니 전용 저장분(v1)은 시드니로 옮겨옴
export const LS_KEY = "sydney-honeymoon-v1";
export const APP_KEY = "honeymoon-app-v2";
export const defaultState = () => ({
  startDate: "", days: Array.from({length:5}, () => ({ stops:[], note:"", times:{} })),
  mode: "transit", routesOn: true, custom: [], cats: Object.keys(CATS), focusDay: null,
  stays: [], stayChosen: null, guests: 2, staySort: "price",
  diary: {},          // 여행 일기: { 날짜순번: { 사람: { mood, text, at } } }
  ratings: {},        // 다녀온 곳 별점: { placeId: { 사람: 1~5 } }
  comments: {},       // 장소별 한마디: { placeId: { 메모id: { by, text, at } } }
  votes: {},          // 함께 고르기: { placeId: { 사람: 1(좋아요) | -1(패스) } }
  likeFilter: "all",  // 장소 목록·지도 필터 (기기별): all | liked | match
  budget: 0, currency: "AUD", fx: 0,   // 총예산(현지 통화), 1단위 = fx원
  expenses: [],       // 지출: { id, title, amount, cat, paidBy(사람|both), day(0부터|null), at }
  bookings: [],       // 예약: { id, type, title, date, time, endDate, endTime, code, link, note, by, at }
  checklist: [],      // 준비물·할 일: { id, text, due(출발 며칠 전), done, doneBy, at }
});
export function normalizePlan(s) {
  if (!s || !Array.isArray(s.days)) return defaultState();
  // 숙소 기능이 생기기 전에 저장된 일정이면 숙소 카테고리를 켜 둠
  if (!s.stays && Array.isArray(s.cats) && !s.cats.includes("stay")) s.cats.push("stay");
  return Object.assign(defaultState(), s);
}
export const emptyApp = () => ({ current: "sydney", plans: {}, myCities: [] });
export function loadApp() {
  try {
    const a = JSON.parse(localStorage.getItem(APP_KEY));
    if (a && a.plans) return Object.assign(emptyApp(), a);
  } catch (e) {}
  const a = emptyApp();
  try {
    const old = JSON.parse(localStorage.getItem(LS_KEY));
    if (old && Array.isArray(old.days)) a.plans.sydney = normalizePlan(old);
  } catch (e) {}
  return a;
}
export let app = loadApp();
export let CITY, PLACES, SAMPLE, CENTER, state;
export function allCities() {
  const mine = app.myCities.map(c => [c.id, Object.assign({ places: [], sample: null, keySpots: [] }, c)]);
  return Object.assign({}, CITIES, Object.fromEntries(mine));
}
export function useCity(id) {
  CITY = allCities()[id] || CITIES.sydney;
  app.current = CITY.id;
  PLACES = CITY.places; SAMPLE = CITY.sample; CENTER = CITY.center;
  const fresh = !app.plans[CITY.id];
  state = app.plans[CITY.id] = normalizePlan(app.plans[CITY.id]);
  if (fresh && CITY.currency) state.currency = CITY.currency;   // 새 도시는 그 나라 통화로 시작
}
// 다른 모듈은 상태를 읽기만 하고, 바꿀 땐 아래 함수를 씀 (ES 모듈 live binding)
export function replaceApp(a) { app = Object.assign(emptyApp(), a); useCity(app.current); }
export function setCityPlan(s) { state = app.plans[CITY.id] = normalizePlan(s); }
export function resetCityPlan() { state = app.plans[CITY.id] = defaultState(); }
// 저장할 때마다 알림을 받을 곳(동기화 모듈)
const saveHooks = [];
export function onSave(fn) { saveHooks.push(fn); }
export function save() {
  try { localStorage.setItem(APP_KEY, JSON.stringify(app)); } catch (e) {}
  saveHooks.forEach(fn => fn());
}
useCity(app.current);
save();   // v1 → v2 이전 결과를 바로 저장

export const allPlaces = () => PLACES.concat(state.custom, state.stays);
export const tempPlaces = {};   // 구글 검색/클릭으로 열어본, 아직 저장 안 한 장소
export const byId = id => allPlaces().find(p => p.id === id) || tempPlaces[id];
export const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

export function gQuery(p) { return p.en ? `${p.en}, ${CITY.suffix}` : `${p.lat},${p.lng}`; }
export function gPlaceUrl(p) {
  if (p.gid) return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(p.name) + "&query_place_id=" + p.gid;
  return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(gQuery(p));
}
export function gDirUrl(stops, mode) {
  if (stops.length < 2) return stops.length ? gPlaceUrl(stops[0]) : null;
  const q = stops.map(gQuery);
  const u = new URLSearchParams({ api:"1", origin:q[0], destination:q[q.length-1], travelmode:mode });
  if (q.length > 2) u.set("waypoints", q.slice(1,-1).join("|"));
  return "https://www.google.com/maps/dir/?" + u.toString();
}
export function km(a, b) {
  const R = 6371, r = x => x * Math.PI / 180;
  const dLat = r(b.lat-a.lat), dLng = r(b.lng-a.lng);
  const h = Math.sin(dLat/2)**2 + Math.cos(r(a.lat))*Math.cos(r(b.lat))*Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
