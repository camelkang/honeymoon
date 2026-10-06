import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { CENTER, CITY } from "./store.js";

// 휴대폰에선 위쪽 바와 아래 시트가 지도를 가리므로, 보이는 부분 안에 맞춰 이동
function visiblePadding(pad) {
  const el = document.getElementById("map"), r = el.getBoundingClientRect();
  const top = document.querySelector(".topbar"), sheet = document.getElementById("sheet"), nav = document.querySelector(".tabs");
  let t = pad, btm = pad;
  if (top && getComputedStyle(top).position === "absolute") t = Math.max(pad, top.getBoundingClientRect().bottom - r.top + pad / 2);
  // 시트는 높이가 바뀌는 중일 수 있어 목표 높이(--sheet-h)로 계산
  const sh = sheet && parseFloat(sheet.style.getPropertyValue("--sheet-h"));
  if (sh) btm = Math.max(pad, sh + (nav ? nav.offsetHeight : 0) + pad / 2);
  if (pad) t += 40;   // 핀은 좌표 위쪽으로 그려지므로 그만큼 더 비움
  if (r.height - t - btm < 120) btm = Math.max(0, r.height - t - 120);   // 시트를 크게 열었을 땐 최소한의 지도 영역만
  return { top: t, bottom: btm, left: pad, right: pad };
}
// 휴대폰: 핀 위로 열린 장소 창이 위쪽 바에 가리지 않게 높이를 제한 (지도가 움직인 뒤 다시 맞춤)
function fitPopup(map, p, node) {
  const pop = node.querySelector(".pop") || node;
  const apply = () => {
    if (!pop.isConnected) return;
    const top = document.querySelector(".topbar"), mapTop = document.getElementById("map").getBoundingClientRect().top;
    const y = map.project([p.lng, p.lat]).y + mapTop;
    const room = y - 30 - 14 - (top ? top.getBoundingClientRect().bottom : 0) - 8 - 28;   // 핀 간격·꼬리·여백·창 안쪽 여백
    pop.classList.add("fit");
    pop.style.maxHeight = Math.max(160, room) + "px";
  };
  apply();
  map.once("moveend", apply);
}
// 장소를 열 때: 휴대폰에선 핀을 보이는 영역의 아래쪽에 두어 위로 열리는 팝업이 다 보이게
function pinOffset() {
  const p = visiblePadding(0), h = document.getElementById("map").clientHeight;
  if (!p.bottom || p.bottom === p.top) return [0, 0];
  const visible = h - p.top - p.bottom, target = p.top + visible * 0.88;
  return [0, target - h / 2];
}

/* ============================== 지도 ============================== */
// 기본 지도는 MapLibre + OpenFreeMap(키 없음, 무료). 구글은 검색·경로·장소 정보(REST)에만 사용.
export const params = new URLSearchParams(location.search);
// 앱 기본 키: 배포 빌드 때 저장소 Secret(GOOGLE_MAPS_API_KEY)이 VITE_GOOGLE_MAPS_API_KEY로 들어옴. 저장소에는 키가 없음
export const BUILD_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
export const USER_KEY = params.get("key") || "";   // 개발·테스트용 키 (주소에 ?key=...)
try { localStorage.removeItem("gmaps-key"); } catch (e) {}   // 예전 설정 화면에서 저장한 키는 지움 (앱 기본 키를 쓰도록)
// ?nokey=1 → 구글 기능 없이 사용
export const API_KEY = params.has("nokey") ? "" : (USER_KEY || BUILD_KEY);

export const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

// 앱의 줌 값은 구글·Leaflet 기준(256px 타일). MapLibre는 512px 타일이라 한 단계 낮음
const toML = z => z - 1;

export let M; // 지도 어댑터
const pins = new Set();   // 장소 핀 (원하는 표시 여부 want, 실제로 지도에 붙었는지 on)
let syncPin = () => {};
export function setMap(a) { M = a; }

// html 문자열을 MapLibre 마커 요소로: 바깥 div는 MapLibre가 위치(transform)를 잡고, 안쪽이 모양
function markerEl(html, cls) {
  const el = document.createElement("div");
  el.className = "mk " + cls;
  el.innerHTML = `<div class="mk-in">${html}</div>`;   // 크기 조절은 안쪽(mk-in)만
  return el;
}

export function createMap() {
  const map = new maplibregl.Map({
    container: "map", style: MAP_STYLE,
    center: [CENTER.lng, CENTER.lat], zoom: toML(CITY.zoom),
    attributionControl: { compact: true },
    // 평평한 기본 지도만: 기울이기·돌리기 없음
    maxPitch: 0, dragRotate: false, pitchWithRotate: false, touchPitch: false,
  });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  // 건물 입체(3D)·지형 음영을 끄고 평면으로 (OpenFreeMap liberty 스타일에 들어 있음)
  map.on("style.load", () => {
    for (const l of map.getStyle().layers || []) {
      if (l.type === "fill-extrusion") { map.setPaintProperty(l.id, "fill-extrusion-height", 0); map.setPaintProperty(l.id, "fill-extrusion-base", 0); }
      else if (l.type === "hillshade" || l.type === "raster") map.setLayoutProperty(l.id, "visibility", "none");
    }
  });
  // 화면 안(+여유 30%)에 있는 핀만 지도에 붙임. 장소가 수백 곳이어도 지도를 움직일 때 버벅이지 않게
  // (지도는 붙어 있는 핀의 위치를 매 프레임 다시 계산함) — 움직임이 끝나면 새로 보이는 핀을 붙임
  const viewBox = () => {
    const b = map.getBounds(), dx = (b.getEast() - b.getWest()) * 0.3, dy = (b.getNorth() - b.getSouth()) * 0.3;
    return { w: b.getWest() - dx, e: b.getEast() + dx, s: b.getSouth() - dy, n: b.getNorth() + dy };
  };
  syncPin = (pin, box = viewBox()) => {
    const v = pin.want && pin.lng >= box.w && pin.lng <= box.e && pin.lat >= box.s && pin.lat <= box.n;
    if (v === pin.on) return;
    pin.on = v;
    v ? pin.m.addTo(map) : pin.m.remove();
  };
  map.on("moveend", () => { const box = viewBox(); pins.forEach(p => syncPin(p, box)); });
  // 멀리서 볼 때는 핀을 작게 (장소가 많은 도시에서 겹쳐 보이지 않게)
  const zoomClass = () => {
    const z = map.getZoom(), el = map.getContainer();
    el.classList.toggle("z-far", z < toML(14.5));
    el.classList.toggle("z-mid", z >= toML(14.5) && z < toML(15.5));
  };
  map.on("zoom", zoomClass); zoomClass();
  window.__map = map;   // 테스트·디버깅용
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
  map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: true }), "top-left");

  // 선(동선)은 지도 스타일이 준비된 뒤에만 추가할 수 있음
  const ready = new Promise(res => map.once("load", res));
  let lineSeq = 0, popup = null, clickFn = null;

  return {
    pin(p, html, onClick) {
      const el = markerEl(html, p.cat === "stay" ? "mk-stay" : "mk-pin");
      el.title = p.name;
      el.setAttribute("aria-label", p.name);   // 화면 낭독기가 "Map marker" 대신 장소 이름을 읽도록
      el.addEventListener("click", e => { e.stopPropagation(); onClick(); });
      const m = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([p.lng, p.lat]);
      const pin = { m, lng: p.lng, lat: p.lat, want: false, on: false };
      pins.add(pin);
      return {
        show(v) { pin.want = v; syncPin(pin); },
        z(v) { el.style.zIndex = v; },
        destroy() { pin.want = false; syncPin(pin); pins.delete(pin); },
      };
    },
    num(p, html, onClick) {
      const el = markerEl(html, "mk-num");
      el.addEventListener("click", e => { e.stopPropagation(); onClick(); });
      const m = new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat([p.lng, p.lat]).addTo(map);
      return { remove() { m.remove(); } };
    },
    line(pts, color, solid) {
      const id = "route-" + (++lineSeq);
      let removed = false, added = false;
      ready.then(() => {
        if (removed) return;
        map.addSource(id, { type: "geojson", data: { type: "Feature", properties: {},
          geometry: { type: "LineString", coordinates: pts.map(p => [p.lng, p.lat]) } } });
        map.addLayer({ id, type: "line", source: id, layout: { "line-cap": "round", "line-join": "round" },
          paint: solid ? { "line-color": color, "line-width": 5, "line-opacity": 0.85 }
                       : { "line-color": color, "line-width": 4, "line-opacity": 0.8, "line-dasharray": [2, 1.5] } });
        added = true;
      });
      return { remove() {
        removed = true;
        if (added) { map.removeLayer(id); map.removeSource(id); }
      } };
    },
    popup(p, node) {
      if (popup) popup.remove();
      // 휴대폰: 팝업은 항상 핀 위쪽으로 (아래쪽은 시트가 가림)
      const phone = !matchMedia("(min-width: 900px)").matches;
      popup = new maplibregl.Popup({ maxWidth: "300px", offset: 30, focusAfterOpen: false, ...(phone ? { anchor: "bottom" } : {}) })
        .setLngLat([p.lng, p.lat]).setDOMContent(node).addTo(map);
      if (phone) fitPopup(map, p, node);
    },
    style() { try { return map.getStyle(); } catch (e) { return null; } },
    closePopup() { if (popup) { popup.remove(); popup = null; } },
    fly(p, z) { map.flyTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), toML(z || 15)), duration: 600, offset: pinOffset() }); },
    fit(pts) {
      if (!pts.length) return;
      if (pts.length === 1) return this.fly(pts[0], 15);
      const b = new maplibregl.LngLatBounds();
      pts.forEach(p => b.extend([p.lng, p.lat]));
      map.fitBounds(b, { padding: visiblePadding(40), maxZoom: toML(16), duration: 600 });
    },
    // 지도 클릭: 빈 곳이면 좌표만, 가게·명소 아이콘이면 그 이름(poi)도 함께 넘김
    tapAt(pos) { if (clickFn) clickFn({ ...pos, poi: null }); },
    onClick(fn) {
      clickFn = fn;
      map.on("click", e => {
        const f = map.queryRenderedFeatures(e.point)
          .find(x => x.sourceLayer === "poi" || (x.layer && x.layer["source-layer"] === "poi"));
        const name = f && (f.properties["name:ko"] || f.properties.name);
        const at = f && f.geometry.type === "Point" ? f.geometry.coordinates : [e.lngLat.lng, e.lngLat.lat];
        fn({ lat: e.lngLat.lat, lng: e.lngLat.lng, poi: name ? { name, lat: at[1], lng: at[0] } : null });
      });
    },
    view(c, z) { map.jumpTo({ center: [c.lng, c.lat], zoom: toML(z) }); },
    bounds() {
      const b = map.getBounds();
      return { n: b.getNorth(), s: b.getSouth(), e: b.getEast(), w: b.getWest(), z: map.getZoom() + 1 };
    },
    cursor(c) { map.getCanvas().style.cursor = c; },
  };
}
