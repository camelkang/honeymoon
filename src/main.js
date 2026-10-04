import "./styles.css";
import { bindUI } from "./actions.js";
import { renderCityBar } from "./cities.js";
import { setGMode } from "./google.js";
import { API_KEY, googleAdapter, leafletAdapter, setMap } from "./map.js";
import { setupPWA } from "./pwa.js";
import { buildMarkers, renderChips, renderDays } from "./render.js";

function start(adapter) {
  setMap(adapter);
  buildMarkers(); renderChips(); renderDays(); renderCityBar(); bindUI(); setupPWA();
}

if (API_KEY) {
  let done = false;
  window.__gmInit = () => {
    done = true; setGMode(true); document.body.classList.add("gmode");
    start(googleAdapter());
  };
  window.gm_authFailure = () => {
    alert("구글 지도 연결에 실패해 기본 지도로 표시합니다.");
    try { localStorage.removeItem("gmaps-key"); } catch (e) {}
    const u = new URL(location.href); u.searchParams.delete("key"); u.searchParams.set("nokey", "1"); location.replace(u.toString());
  };
  const s = document.createElement("script");
  s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(API_KEY)}&language=ko&region=AU&callback=__gmInit`;
  s.async = true;
  s.onerror = () => { if (!done) { done = true; start(leafletAdapter()); } };
  document.head.appendChild(s);
} else {
  start(leafletAdapter());
}
