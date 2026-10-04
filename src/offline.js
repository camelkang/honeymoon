import { icon } from "./icons.js";
import { M } from "./map.js";
import { CITY, PLACES, allCities, byId, esc, state } from "./store.js";

// 지도 미리 저장: 여행지 지도를 미리 받아 두면 데이터·와이파이가 없어도 지도가 보임
// 저장한 타일은 브라우저 캐시(offline-도시)에 두고, 서비스 워커가 먼저 꺼내 씀

const META_KEY = "offline-maps-v1";
const TILEJSON = "https://tiles.openfreemap.org/planet";
const AVG_KB = 45;              // 벡터 타일 평균 크기(대략) — 예상 용량 안내용
const MAX_TILES = 4000;
const cacheName = id => "offline-" + id;
let meta = {};
try { meta = JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch (e) {}
const saveMeta = () => { try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch (e) {} };
let job = null;   // 진행 중인 저장 { city, done, total, bytes, cancel }

/* ---------- 받을 영역과 타일 ---------- */
const lon2x = (lon, z) => Math.floor((lon + 180) / 360 * 2 ** z);
const lat2y = (lat, z) => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z); };
// 일정·숙소 후보에 담은 곳 (없으면 도시 추천 장소) 을 감싸는 영역, 너무 넓으면 도시 중심 근처로
export function tripArea() {
  const ids = new Set([...state.days.flatMap(d => d.stops), ...(state.stays || []).map(s => s.id)]);
  let pts = [...ids].map(byId).filter(p => p && p.lat != null);
  if (pts.length < 2) pts = PLACES.length ? PLACES : [CITY.center];
  const c = CITY.center;
  pts = pts.filter(p => Math.abs(p.lat - c.lat) < 0.6 && Math.abs(p.lng - c.lng) < 0.6);   // 근교 당일치기 장소는 빼고
  if (!pts.length) pts = [c];
  let s = Math.min(...pts.map(p => p.lat)), n = Math.max(...pts.map(p => p.lat));
  let w = Math.min(...pts.map(p => p.lng)), e = Math.max(...pts.map(p => p.lng));
  const pad = Math.max(0.01, (n - s) * 0.12, (e - w) * 0.12);
  return { s: s - pad, n: n + pad, w: w - pad, e: e + pad };
}
export function tileList(area, maxZ = 14) {
  const out = [];
  // 넓게 보는 단계(z5~9)는 도시 주변만, 자세한 단계(z10~14)는 여행 영역 전체
  for (let z = 5; z <= maxZ; z++) {
    const x0 = lon2x(area.w, z), x1 = lon2x(area.e, z), y0 = lat2y(area.n, z), y1 = lat2y(area.s, z);
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) out.push([z, x, y]);
  }
  // 너무 많으면 가장 자세한 단계부터 줄임
  if (out.length > MAX_TILES && maxZ > 12) return tileList(area, maxZ - 1);
  return out;
}

async function tileTemplate() {
  const style = M.style();
  const src = style && Object.values(style.sources || {}).find(s => s.type === "vector" && (s.url || s.tiles));
  if (src && src.tiles) return { tiles: src.tiles[0], maxzoom: src.maxzoom || 14, style };
  const j = await (await fetch(src && src.url || TILEJSON)).json();
  return { tiles: j.tiles[0], maxzoom: j.maxzoom || 14, style };
}
// 지도 글자(글꼴)와 아이콘 이미지도 함께
function extras(style) {
  if (!style) return [];
  const urls = [];
  if (style.glyphs) {
    const fonts = new Set();
    for (const l of style.layers || []) { const f = l.layout && l.layout["text-font"]; if (Array.isArray(f) && typeof f[0] === "string") fonts.add(f.join(",")); }
    for (const f of fonts) for (const r of ["0-255", "256-511", "8192-8447"]) urls.push(style.glyphs.replace("{fontstack}", encodeURIComponent(f)).replace("{range}", r));
  }
  if (typeof style.sprite === "string") for (const s of ["", "@2x"]) for (const ext of [".json", ".png"]) urls.push(style.sprite + s + ext);
  return urls;
}

export function estimate() {
  const n = tileList(tripArea()).length;
  return { tiles: n, mb: Math.max(1, Math.round(n * AVG_KB / 1024)) };
}

export async function downloadMap(onProgress) {
  if (job) return;
  const city = CITY.id, area = tripArea();
  job = { city, done: 0, total: 0, bytes: 0, cancel: false, failed: 0 };
  onProgress();
  try {
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    const { tiles, maxzoom, style } = await tileTemplate();
    const list = tileList(area, Math.min(14, maxzoom)).map(([z, x, y]) => tiles.replace("{z}", z).replace("{x}", x).replace("{y}", y)).concat(extras(style));
    job.total = list.length; onProgress();
    const cache = await caches.open(cacheName(city));
    let next = 0;
    const worker = async () => {
      while (next < list.length && !job.cancel) {
        const url = list[next++];
        try {
          if (!(await cache.match(url))) {
            const res = await fetch(url, { mode: "cors" });
            if (res.ok) { const blob = await res.clone().blob(); job.bytes += blob.size; await cache.put(url, res); }
            else if (res.status !== 404) job.failed++;   // 바다 위 등 없는 타일(404)은 정상
          }
        } catch (e) { job.failed++; }
        job.done++;
        if (job.done % 10 === 0 || job.done === job.total) onProgress();
      }
    };
    await Promise.all(Array.from({ length: 6 }, worker));
    if (!job.cancel) {
      meta[city] = { at: Date.now(), tiles: job.total, bytes: (meta[city] && meta[city].bytes || 0) + job.bytes, failed: job.failed, area };
      saveMeta();
    }
  } catch (e) { job.error = true; }
  const finished = job; job = null;
  onProgress(finished);
}
export function cancelDownload() { if (job) job.cancel = true; }
export async function removeOffline(city = CITY.id) {
  await caches.delete(cacheName(city)).catch(() => {});
  delete meta[city]; saveMeta();
}

/* ---------- 준비 탭 카드 ---------- */
const mbText = b => b >= 1048576 ? `${(b / 1048576).toFixed(b >= 10485760 ? 0 : 1)}MB` : `${Math.max(1, Math.round(b / 1024))}KB`;
export function offlineCardHtml() {
  if (typeof caches === "undefined") return "";
  const m = meta[CITY.id];
  const others = Object.keys(meta).filter(id => id !== CITY.id).map(id => (allCities()[id] || {}).name).filter(Boolean);
  let body;
  if (job && job.city === CITY.id) {
    const pct = job.total ? Math.round(job.done / job.total * 100) : 0;
    body = `<p class="muted">지도 저장 중… ${job.done.toLocaleString()} / ${job.total ? job.total.toLocaleString() : "…"}장 · ${mbText(job.bytes)}</p>
      <div class="meter" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>
      <button class="btn sm" data-off="cancel">그만 받기</button>`;
  } else if (m) {
    const d = new Date(m.at);
    body = `<p class="off-ok">${icon("check", 16)} ${esc(CITY.name)} 지도가 이 기기에 저장돼 있어요 <small>· ${m.tiles.toLocaleString()}장 · ${mbText(m.bytes)} · ${d.getMonth() + 1}/${d.getDate()}</small></p>
      ${m.failed ? `<p class="hint">${m.failed}장은 받지 못했어요. 다시 받으면 빠진 것만 채워요.</p>` : ""}
      <div class="row"><button class="btn sm" data-off="get">다시 받기 (일정 바뀐 곳 포함)</button><button class="btn sm" data-off="remove">${icon("trash", 14)} 지우기</button></div>`;
  } else {
    const e = estimate();
    body = `<p class="muted">해외에서 데이터가 없어도 지도가 보이게, 일정에 담은 지역의 지도를 미리 받아 둬요. 와이파이에서 받는 걸 추천해요.</p>
      <button class="btn sm primary" data-off="get">${icon("download", 15)} 이 여행 지역 지도 저장 <small>· 약 ${e.mb}MB</small></button>`;
  }
  return `<section class="card" id="offlineCard">
    <div class="card-h">${icon("map", 18)}<b>오프라인 지도</b></div>
    ${body}
    ${others.length ? `<p class="hint">다른 저장된 도시: ${others.map(esc).join(", ")}</p>` : ""}
  </section>`;
}
export function bindOffline(rerender) {
  const refresh = finished => {
    const el = document.getElementById("offlineCard");
    if (el) el.outerHTML = offlineCardHtml();
    if (finished && !finished.cancel && !finished.error) rerender(`지도를 저장했어요 (${mbText(finished.bytes)})`);
    if (finished && finished.error) rerender("지도를 받지 못했어요. 인터넷 연결을 확인해 주세요.");
  };
  document.addEventListener("click", async e => {
    const b = e.target.closest("[data-off]"); if (!b) return;
    const act = b.dataset.off;
    if (act === "get") downloadMap(refresh);
    if (act === "cancel") cancelDownload();
    if (act === "remove" && confirm(`${CITY.name}의 저장한 지도를 지울까요?`)) { await removeOffline(); refresh(); }
  });
}
