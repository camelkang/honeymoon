import { setAddMode, toast } from "./actions.js";
import { GMODE, gTextSearch } from "./google.js";
import { M } from "./map.js";
import { renderPick } from "./pick.js";
import { renderPrep } from "./prep.js";
import { addMode, buildMarkers, renderChips, renderDays } from "./render.js";
import { CENTER, CITY, allCities, app, esc, save, useCity } from "./store.js";

/* ============================== 도시 전환 ============================== */
export function cityOptionLabel(c) {
  const plan = app.plans[c.id];
  const n = plan ? plan.days.reduce((a, d) => a + d.stops.length, 0) : 0;
  let extra = "";
  if (plan && plan.startDate) { const [, m, d] = plan.startDate.split("-"); extra = ` · ${+m}/${+d}~`; }
  else if (n) extra = ` · ${n}곳`;
  return `${c.flag || "📍"} ${c.name}${extra}`;
}
export function renderCityBar() {
  const sel = document.getElementById("citySel");
  sel.innerHTML = Object.values(allCities()).map(c => `<option value="${c.id}">${esc(cityOptionLabel(c))}</option>`).join("")
    + `<option value="__add">➕ 다른 도시 추가…</option>`;
  sel.value = CITY.id;
  document.getElementById("btnCityDel").hidden = !CITY.custom;
  document.title = `${CITY.name} · 둘이서`;
}
export function refreshCity(move) {
  if (move) M.view(CENTER, CITY.zoom);
  document.getElementById("gResults").innerHTML = "";
  document.getElementById("q").value = "";
  buildMarkers(); renderChips(); renderDays(); renderCityBar(); renderPick(); renderPrep();
}
export function switchCity(id) {
  if (addMode) setAddMode(false);
  M.closePopup();
  useCity(id); save(); refreshCity(true);
}
export async function geocodeCity(name) {
  try {   // OpenStreetMap 지오코딩 (키 불필요)
    const r = await fetch("https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=ko&q=" + encodeURIComponent(name));
    const j = await r.json();
    if (j[0]) return { lat: +j[0].lat, lng: +j[0].lon };
  } catch (e) {}
  if (GMODE) {
    try { const d = (await gTextSearch(name, null))[0]; if (d && d.lat != null) return { lat: d.lat, lng: d.lng }; } catch (e) {}
  }
  return null;
}
export async function addCity() {
  const name = (prompt("추가할 도시 이름을 입력하세요 (예: 퍼스, 호바트, 오클랜드, 발리)") || "").trim();
  if (!name) return renderCityBar();
  toast(`"${name}" 위치 찾는 중…`);
  const c = await geocodeCity(name);
  if (!c) { renderCityBar(); return alert("도시 위치를 찾지 못했어요. 영문 이름으로도 시도해 보세요."); }
  const city = { id: "u" + Date.now().toString(36), name, flag: "📍", center: c, zoom: 13, suffix: name,
                 airbnb: name.replace(/[\s,]+/g, "-"), custom: true };
  app.myCities.push(city);
  switchCity(city.id);
  toast(`${name} 추가! ${GMODE ? "구글 검색이나 " : ""}오른쪽 위 핀 버튼으로 장소를 채워보세요`);
}
export function deleteCity() {
  if (!CITY.custom || !confirm(`${CITY.name}와(과) 이 도시의 일정을 모두 삭제할까요?`)) return;
  app.myCities = app.myCities.filter(c => c.id !== CITY.id);
  delete app.plans[CITY.id];
  switchCity("sydney");
}
