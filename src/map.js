import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { stayLabel } from "./render.js";
import { CENTER, CITY, esc, state } from "./store.js";

/* ============================== 지도 어댑터 ============================== */
// Google Maps 키가 있으면 Google Maps, 없으면 Leaflet(무료 타일)로 같은 기능을 제공.
export const params = new URLSearchParams(location.search);
// 앱 기본 키: 배포 빌드 때 저장소 Secret(GOOGLE_MAPS_API_KEY)이 VITE_GOOGLE_MAPS_API_KEY로 들어옴. 저장소에는 키가 없음
export const BUILD_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "";
export let USER_KEY = params.get("key") || "";   // 개발·테스트용 키 (선택)
try { USER_KEY = USER_KEY || localStorage.getItem("gmaps-key") || ""; } catch (e) {}
// ?nokey=1 → 구글 없이 기본 지도 (키 인증 실패 시 무한 새로고침 방지)
export let API_KEY = params.has("nokey") ? "" : (USER_KEY || BUILD_KEY);

export let M; // 어댑터
export function setMap(a) { M = a; }

export function leafletAdapter() {
  const map = L.map("map", { zoomControl:true }).setView([CENTER.lat, CENTER.lng], CITY.zoom);
  const base = {
    "기본 지도": L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      maxZoom: 20, subdomains:"abcd",
      attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>' }),
    "위성": L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
      maxZoom: 19, attribution:"Tiles &copy; Esri" }),
  };
  base["기본 지도"].addTo(map);
  L.control.layers(base, null, { position:"topright" }).addTo(map);
  const popup = L.popup({ maxWidth: 300 });
  return {
    pin(p, html, onClick) {
      const icon = p.cat === "stay"
        ? L.divIcon({ className:"", html, iconSize:[0,0], iconAnchor:[0,0], popupAnchor:[0,-26] })
        : L.divIcon({ className:"", html, iconSize:[30,30], iconAnchor:[15,30], popupAnchor:[0,-28] });
      const m = L.marker([p.lat,p.lng], { icon, title:p.name, zIndexOffset: p.cat === "stay" ? 500 : 0 }).on("click", onClick);
      return { show(v){ v ? m.addTo(map) : m.remove(); }, z(v){ m.setZIndexOffset(v); } };
    },
    num(p, html, onClick) {
      const icon = L.divIcon({ className:"", html, iconSize:[24,24], iconAnchor:[12,12] });
      const m = L.marker([p.lat,p.lng], { icon, zIndexOffset:1000 }).on("click", onClick).addTo(map);
      return { remove(){ m.remove(); } };
    },
    line(pts, color, solid) {
      const l = L.polyline(pts.map(p => [p.lat,p.lng]), solid ? { color, weight:5, opacity:.85 } : { color, weight:4, opacity:.8, dashArray:"8 6" }).addTo(map);
      return { remove(){ l.remove(); } };
    },
    popup(p, node) { popup.setLatLng([p.lat,p.lng]).setContent(node).openOn(map); },
    closePopup() { map.closePopup(); },
    fly(p, z) { map.flyTo([p.lat,p.lng], Math.max(map.getZoom(), z || 15), { duration:.6 }); },
    fit(pts) {
      if (!pts.length) return;
      if (pts.length === 1) return this.fly(pts[0], 15);
      map.fitBounds(pts.map(p => [p.lat,p.lng]), { padding:[50,50] });
    },
    onClick(fn) { map.on("click", e => fn({ lat:e.latlng.lat, lng:e.latlng.lng })); },
    view(c, z) { map.setView([c.lat, c.lng], z); },
    bounds() {
      const b = map.getBounds();
      return { n:b.getNorth(), s:b.getSouth(), e:b.getEast(), w:b.getWest(), z:map.getZoom() };
    },
    cursor(c) { map.getContainer().style.cursor = c; },
  };
}

export function googleAdapter() {
  const g = google.maps;
  const map = new g.Map(document.getElementById("map"), {
    center: CENTER, zoom: CITY.zoom, mapTypeControl: true, streetViewControl: true, fullscreenControl: false,
    clickableIcons: true,
  });
  const info = new g.InfoWindow({ maxWidth: 300 });
  const circleIcon = (color, scale) => ({ path:g.SymbolPath.CIRCLE, fillColor:color, fillOpacity:1, strokeColor:"#fff", strokeWeight:2, scale });
  // 에어비앤비 후보: 가격이 적힌 말풍선 핀
  const stayIcon = p => {
    const on = state.stayChosen === p.id, text = stayLabel(p);
    const w = 18 + [...text].length * 8;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="30">
      <rect x="1" y="1" width="${w-2}" height="22" rx="11" fill="${on ? "#ff385c" : "#fff"}" stroke="#ff385c" stroke-width="2"/>
      <path d="M${w/2-5} 22.5 L${w/2} 29 L${w/2+5} 22.5 Z" fill="#ff385c"/>
      <text x="${w/2}" y="16.5" font-family="Arial,sans-serif" font-size="12" font-weight="700" text-anchor="middle" fill="${on ? "#fff" : "#222"}">${esc(text)}</text></svg>`;
    return { url:"data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg), anchor:new g.Point(w/2, 29) };
  };
  return {
    pin(p, html, onClick, color, emoji) {
      const m = p.cat === "stay"
        ? new g.Marker({ position:{ lat:p.lat, lng:p.lng }, title:p.name, icon:stayIcon(p), zIndex:500 })
        : new g.Marker({ position:{ lat:p.lat, lng:p.lng }, title:p.name, icon:circleIcon(color, 14), label:{ text:emoji, fontSize:"15px" } });
      m.addListener("click", onClick);
      return { show(v){ m.setMap(v ? map : null); }, z(v){ m.setZIndex(v); } };
    },
    num(p, html, onClick, color, n) {
      const m = new g.Marker({ position:{ lat:p.lat, lng:p.lng }, map, zIndex:1000, icon:circleIcon(color, 11),
        label:{ text:String(n), color:"#fff", fontSize:"12px", fontWeight:"700" } });
      m.addListener("click", onClick);
      return { remove(){ m.setMap(null); } };
    },
    line(pts, color, solid) {
      const l = solid
        ? new g.Polyline({ path:pts, map, strokeColor:color, strokeOpacity:.85, strokeWeight:5 })
        : new g.Polyline({ path:pts, map, strokeOpacity:0,
            icons:[{ icon:{ path:"M 0,-1 0,1", strokeOpacity:.85, strokeColor:color, scale:3 }, offset:"0", repeat:"14px" }] });
      return { remove(){ l.setMap(null); } };
    },
    popup(p, node) { info.setContent(node); info.setPosition({ lat:p.lat, lng:p.lng }); info.open({ map }); },
    closePopup() { info.close(); },
    fly(p, z) { map.panTo({ lat:p.lat, lng:p.lng }); if (map.getZoom() < (z||15)) map.setZoom(z||15); },
    fit(pts) {
      if (!pts.length) return;
      if (pts.length === 1) return this.fly(pts[0], 15);
      const b = new g.LatLngBounds(); pts.forEach(p => b.extend({ lat:p.lat, lng:p.lng })); map.fitBounds(b, 50);
    },
    onClick(fn) {
      map.addListener("click", e => {
        if (e.placeId) e.stop();   // 구글 기본 정보창 대신 우리 팝업 사용
        fn({ lat:e.latLng.lat(), lng:e.latLng.lng(), placeId:e.placeId });
      });
    },
    cursor(c) { map.setOptions({ draggableCursor: c === "" ? null : c }); },
    view(c, z) { map.setCenter(c); map.setZoom(z); },
    bounds() {
      const b = map.getBounds(); if (!b) return null;
      const ne = b.getNorthEast(), sw = b.getSouthWest();
      return { n:ne.lat(), s:sw.lat(), e:ne.lng(), w:sw.lng(), z:map.getZoom() };
    },
  };
}
