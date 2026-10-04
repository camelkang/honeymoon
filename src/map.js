import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { CENTER, CITY } from "./store.js";

/* ============================== 지도 ============================== */
// 기본 지도는 MapLibre + OpenFreeMap(키 없음, 무료). 구글은 검색·경로·장소 정보(REST)에만 사용.
export const params = new URLSearchParams(location.search);
// 앱 기본 키: 배포 빌드 때 저장소 Secret(GOOGLE_MAPS_API_KEY)이 VITE_GOOGLE_MAPS_API_KEY로 들어옴. 저장소에는 키가 없음
export const BUILD_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
export let USER_KEY = params.get("key") || "";   // 개발·테스트용 키 (선택)
try { USER_KEY = USER_KEY || localStorage.getItem("gmaps-key") || ""; } catch (e) {}
// ?nokey=1 → 구글 기능 없이 사용
export let API_KEY = params.has("nokey") ? "" : (USER_KEY || BUILD_KEY);

export const MAP_STYLE = "https://tiles.openfreemap.org/styles/liberty";

// 앱의 줌 값은 구글·Leaflet 기준(256px 타일). MapLibre는 512px 타일이라 한 단계 낮음
const toML = z => z - 1;

export let M; // 지도 어댑터
export function setMap(a) { M = a; }

// html 문자열을 MapLibre 마커 요소로: 바깥 div는 MapLibre가 위치(transform)를 잡고, 안쪽이 모양
function markerEl(html, cls) {
  const el = document.createElement("div");
  el.className = "mk " + cls;
  el.innerHTML = html;
  return el;
}

export function createMap() {
  const map = new maplibregl.Map({
    container: "map", style: MAP_STYLE,
    center: [CENTER.lng, CENTER.lat], zoom: toML(CITY.zoom),
    attributionControl: { compact: true },
  });
  window.__map = map;   // 테스트·디버깅용
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
  map.addControl(new maplibregl.GeolocateControl({ trackUserLocation: true }), "top-left");

  // 선(동선)은 지도 스타일이 준비된 뒤에만 추가할 수 있음
  const ready = new Promise(res => map.once("load", res));
  let lineSeq = 0, popup = null;

  return {
    pin(p, html, onClick) {
      const el = markerEl(html, p.cat === "stay" ? "mk-stay" : "mk-pin");
      el.title = p.name;
      el.addEventListener("click", e => { e.stopPropagation(); onClick(); });
      const m = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([p.lng, p.lat]);
      return { show(v) { v ? m.addTo(map) : m.remove(); }, z(v) { el.style.zIndex = v; } };
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
      popup = new maplibregl.Popup({ maxWidth: "300px", offset: 30, focusAfterOpen: false })
        .setLngLat([p.lng, p.lat]).setDOMContent(node).addTo(map);
    },
    closePopup() { if (popup) { popup.remove(); popup = null; } },
    fly(p, z) { map.flyTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), toML(z || 15)), duration: 600 }); },
    fit(pts) {
      if (!pts.length) return;
      if (pts.length === 1) return this.fly(pts[0], 15);
      const b = new maplibregl.LngLatBounds();
      pts.forEach(p => b.extend([p.lng, p.lat]));
      map.fitBounds(b, { padding: 50, maxZoom: toML(16), duration: 600 });
    },
    // 지도 클릭: 빈 곳이면 좌표만, 가게·명소 아이콘이면 그 이름(poi)도 함께 넘김
    onClick(fn) {
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
