import { API_KEY } from "./map.js";
import { renderDays } from "./render.js";
import { esc, gQuery, km } from "./store.js";

/* ============================== 구글 API (Places / Routes) ============================== */
// 키가 있으면 페이지 안에서 장소 정보·실제 이동경로를 바로 보여줌 (결과는 브라우저에 캐시해 호출 최소화)
export let GMODE = false;
export function setGMode(v) { GMODE = v; }
export const apiErrors = {};
export const GCACHE_KEY = "sydney-gcache-v1";
export let gcache = { det:{}, leg:{} };
try { gcache = Object.assign(gcache, JSON.parse(localStorage.getItem(GCACHE_KEY)) || {}); } catch (e) {}
export function saveCache() { try { localStorage.setItem(GCACHE_KEY, JSON.stringify(gcache)); } catch (e) {} }

export const API_NAMES = { places:"Places API (New)", routes:"Routes API" };
export async function gApi(service, url, body, fieldMask) {
  if (apiErrors[service]) throw new Error(apiErrors[service]);
  const headers = { "X-Goog-Api-Key": API_KEY, "X-Goog-FieldMask": fieldMask };
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(url, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data.error && data.error.message) || ("HTTP " + res.status);
    if (res.status === 401 || res.status === 403 || /API key/i.test(msg)) { apiErrors[service] = msg; showApiNotice(); }
    throw new Error(msg);
  }
  return data;
}
// 사용자에게는 무엇이 대신 보이는지만 짧게 알리고(닫기 가능), 원인(영문 오류)은 ⚙️ 설정에서 확인
let noticeClosed = false;
export function apiProblemText() {
  return Object.entries(apiErrors).map(([k, m]) => `${API_NAMES[k]}: ${m}`).join("\n");
}
export function showApiNotice() {
  const el = document.getElementById("apiNotice");
  const what = [apiErrors.routes && "실제 이동 경로", apiErrors.places && "구글 장소 정보·검색"].filter(Boolean);
  el.hidden = !what.length || noticeClosed;
  el.innerHTML = `<span>지금은 ${what.join("·")}를 불러올 수 없어서 ${apiErrors.routes ? "직선 거리로 " : "기본 정보로 "}보여드리고 있어요.</span>
    <button class="btn sm" data-x aria-label="알림 닫기">닫기</button>`;
  el.querySelector("[data-x]").onclick = () => { noticeClosed = true; el.hidden = true; };
  console.warn("Google API 거부:\n" + apiProblemText());
  scheduleRender();
}

export const PF = ["id","displayName","formattedAddress","location","rating","userRatingCount","regularOpeningHours.weekdayDescriptions",
            "photos","googleMapsUri","websiteUri","internationalPhoneNumber","primaryTypeDisplayName"];
export function toDetail(pl) {
  return {
    gid: pl.id, name: pl.displayName && pl.displayName.text, addr: pl.formattedAddress,
    lat: pl.location && pl.location.latitude, lng: pl.location && pl.location.longitude,
    rating: pl.rating, count: pl.userRatingCount, hours: pl.regularOpeningHours && pl.regularOpeningHours.weekdayDescriptions,
    photo: pl.photos && pl.photos[0] && pl.photos[0].name, uri: pl.googleMapsUri, web: pl.websiteUri,
    phone: pl.internationalPhoneNumber, type: pl.primaryTypeDisplayName && pl.primaryTypeDisplayName.text, t: Date.now(),
  };
}
export async function gTextSearch(textQuery, center, radius) {
  const r = await gApi("places", "https://places.googleapis.com/v1/places:searchText", {
    textQuery, languageCode: "ko",
    ...(center ? { locationBias: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius } } } : {}),
  }, PF.map(f => "places." + f).join(","));
  return (r.places || []).map(toDetail);
}
export async function getDetails(p) {
  const c = gcache.det[p.id];
  if (c && Date.now() - c.t < 7 * 864e5) return c;
  let d = null;
  if (p.gid) {
    d = toDetail(await gApi("places", `https://places.googleapis.com/v1/places/${encodeURIComponent(p.gid)}?languageCode=ko`, null, PF.join(",")));
  } else {
    d = (await gTextSearch(gQuery(p), p, 1000))[0] || null;
  }
  if (d) { gcache.det[p.id] = d; saveCache(); }
  return d;
}
export function photoUrl(name) { return `https://places.googleapis.com/v1/${name}/media?maxWidthPx=480&key=${encodeURIComponent(API_KEY)}`; }
export function detailsHtml(d) {
  if (!d) return `<span class="muted">구글 장소 정보를 찾지 못했어요.</span>`;
  return `${d.photo ? `<img src="${photoUrl(d.photo)}" alt="" loading="lazy" onerror="this.remove()">` : ""}
    ${d.rating ? `<div><span class="stars">★ ${d.rating.toFixed(1)}</span> <span class="muted">리뷰 ${(d.count || 0).toLocaleString()}개${d.type ? " · " + esc(d.type) : ""}</span></div>` : ""}
    ${d.addr ? `<div class="muted">${esc(d.addr)}</div>` : ""}
    ${d.hours ? `<details><summary>🕒 영업시간</summary><ul>${d.hours.map(h => `<li>${esc(h)}</li>`).join("")}</ul></details>` : ""}
    <div class="row" style="margin-top:4px">
      ${d.web ? `<a href="${esc(d.web)}" target="_blank" rel="noopener">🌐 웹사이트</a>` : ""}
      ${d.phone ? `<span class="muted">📞 ${esc(d.phone)}</span>` : ""}
    </div>`;
}

// ---- 실제 이동 경로 (Routes API) ----
export const RMODE = { transit:"TRANSIT", walking:"WALK", driving:"DRIVE" };
export const MODE_ICON = { transit:"🚆", walking:"🚶", driving:"🚗" };
export const VEH = { BUS:"🚌", INTERCITY_BUS:"🚌", TROLLEYBUS:"🚌", SUBWAY:"🚇", METRO_RAIL:"🚇", HEAVY_RAIL:"🚆", RAIL:"🚆",
              COMMUTER_TRAIN:"🚆", HIGH_SPEED_TRAIN:"🚆", LONG_DISTANCE_TRAIN:"🚆", LIGHT_RAIL:"🚊", TRAM:"🚊", FERRY:"⛴️", MONORAIL:"🚝" };
export const legKey = (a, b, mode) => `${mode}|${a.lat.toFixed(5)},${a.lng.toFixed(5)}|${b.lat.toFixed(5)},${b.lng.toFixed(5)}`;
export const legPending = new Set();
export function getLeg(a, b, mode) {
  const k = legKey(a, b, mode);
  if (gcache.leg[k]) return gcache.leg[k];
  if (!GMODE || apiErrors.routes || legPending.has(k)) return null;
  legPending.add(k);
  fetchLeg(a, b, mode)
    .then(l => { gcache.leg[k] = l; saveCache(); scheduleRender(); })
    .catch(() => {})
    .finally(() => legPending.delete(k));
  return null;
}
export function nextSydneyMorning() {
  // 대중교통 시간표 기준: 내일 오전 10~11시 (시드니) — 지금이 새벽이어도 현실적인 소요시간이 나오도록
  const d = new Date(); d.setUTCDate(d.getUTCDate() + 1); d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}
export async function fetchLeg(a, b, mode) {
  const loc = p => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
  const FM = "routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps.travelMode,routes.legs.steps.transitDetails";
  const req = m => gApi("routes", "https://routes.googleapis.com/directions/v2:computeRoutes", Object.assign(
    { origin: loc(a), destination: loc(b), travelMode: RMODE[m], languageCode: "ko", units: "METRIC" },
    m === "transit" ? { departureTime: nextSydneyMorning() } : {}), FM);
  let used = mode, r = await req(mode);
  if (!(r.routes && r.routes.length) && mode === "transit") { used = "walking"; r = await req("walking"); }
  const rt = r.routes && r.routes[0];
  if (!rt) return { none: true };
  const lines = []; let anyTransit = false;
  (rt.legs || []).forEach(l => (l.steps || []).forEach(s => {
    if (s.travelMode !== "TRANSIT") return;
    anyTransit = true;
    const tl = s.transitDetails && s.transitDetails.transitLine;
    if (!tl) return;
    const lab = (VEH[tl.vehicle && tl.vehicle.type] || "🚌") + " " + (tl.nameShort || tl.name || "");
    if (lines[lines.length - 1] !== lab) lines.push(lab);
  }));
  if (used === "transit" && !anyTransit) used = "walking";
  return { sec: parseInt(rt.duration, 10) || 0, m: rt.distanceMeters || 0, poly: rt.polyline && rt.polyline.encodedPolyline, mode: used, lines };
}
export function decodePolyline(str) {
  const pts = []; let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const k of [0, 1]) {
      let shift = 0, result = 0, b;
      do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const v = (result & 1) ? ~(result >> 1) : (result >> 1);
      if (k === 0) lat += v; else lng += v;
    }
    pts.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return pts;
}
export const fmtDur = s => { const m = Math.max(1, Math.round(s / 60)); return m < 60 ? `${m}분` : `${Math.floor(m / 60)}시간${m % 60 ? " " + (m % 60) + "분" : ""}`; };
export const fmtDist = m => m < 1000 ? `${Math.round(m)}m` : `${(m / 1000).toFixed(1)}km`;
export let renderT;
export function scheduleRender() {
  clearTimeout(renderT);
  renderT = setTimeout(() => {
    // 메모·시간 입력 중에는 다시 그리지 않음 (포커스 유지)
    const a = document.activeElement;
    if (a && a.closest && a.closest("#days") && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return scheduleRender();
    renderDays();
  }, 300);
}
