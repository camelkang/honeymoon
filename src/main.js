import "./styles.css";
import { bindUI } from "./actions.js";
import { renderCityBar } from "./cities.js";
import { setGMode } from "./google.js";
import { API_KEY, createMap, setMap } from "./map.js";
import { setupPWA } from "./pwa.js";
import { buildMarkers, renderChips, renderDays } from "./render.js";

function start(adapter) {
  setMap(adapter);
  buildMarkers(); renderChips(); renderDays(); renderCityBar(); bindUI(); setupPWA();
}

// 키가 있으면 구글 검색·경로·장소 정보를 켬 (지도 자체는 항상 무료 지도)
if (API_KEY) { setGMode(true); document.body.classList.add("gmode"); }
start(createMap());
