import { toast } from "./actions.js";
import { refreshCity, switchCity } from "./cities.js";
import { icon } from "./icons.js";
import { renderPrep } from "./prep.js";
import { CITY, allCities, app, esc, isoAdd, save, state } from "./store.js";
import { applyTrip, hasTrip, segments, tripDates, validTrip } from "./trip.js";

// 여러 도시 일정표 화면: 일정 탭 위쪽 막대(도시 구간) + 편집 창

const md = s => { const d = new Date(s + "T00:00:00"); return `${d.getMonth() + 1}/${d.getDate()}`; };
// 11/17~19 (같은 달), 11/30~12/2 (달이 바뀜)
export const rangeText = sg => {
  if (sg.n <= 1) return md(sg.from);
  const [m1] = md(sg.from).split("/"), [m2, d2] = md(sg.to).split("/");
  return `${md(sg.from)}~${m1 === m2 ? d2 : `${m2}/${d2}`}`;
};
const cityName = id => (allCities()[id] || {}).name || id;
const flag = id => (allCities()[id] || {}).flag || "📍";

export function renderTripBar() {
  const el = document.getElementById("tripBar"); if (!el) return;
  const on = hasTrip();
  document.getElementById("pane-plan").classList.toggle("trip-on", on);
  if (!on) {
    el.innerHTML = `<button class="trip-add" data-trip="edit">${icon("plane", 15)} 여러 도시를 여행하나요? 도시별 날짜 정하기</button>`;
    return;
  }
  const segs = segments(), here = segs.some(s => s.city === CITY.id);
  el.innerHTML = `<div class="trip-bar">
    <div class="trip-segs">${segs.map((s, k) => `${k ? `<span class="trip-arrow">›</span>` : ""}<button class="trip-seg ${s.city === CITY.id ? "on" : ""}" data-tripcity="${esc(s.city)}">
      <span>${esc(flag(s.city))} ${esc(cityName(s.city))}</span><small>${rangeText(s)} · ${s.n}일</small></button>`).join("")}</div>
    <button class="btn sm" data-trip="edit">${icon("calendar", 15)} 일정표</button>
  </div>
  ${here ? "" : `<p class="hint">${esc(CITY.name)}은(는) 여행 일정표에 없어요. 일정표에서 날짜를 정하면 날짜별 일정이 생겨요.</p>`}`;
}

/* ---------- 편집 창 ---------- */
let draft = null;
function blankDraft() {
  if (hasTrip()) return JSON.parse(JSON.stringify(app.trip));
  const start = state.startDate || isoAdd(new Date().toISOString().slice(0, 10), 30);
  return { start, end: isoAdd(start, Math.max(1, state.days.length) - 1), base: CITY.id, stops: [] };
}
const cityOptions = sel => Object.values(allCities()).map(c => `<option value="${esc(c.id)}" ${c.id === sel ? "selected" : ""}>${esc(c.flag || "📍")} ${esc(c.name)}</option>`).join("");

function renderDlg() {
  const body = document.getElementById("tripBody"), t = draft;
  const segs = segments(t), n = tripDates(t).length;
  body.innerHTML = `
    <div class="row nowrap">
      <label style="flex:1">여행 시작<input type="date" data-tf="start" value="${esc(t.start || "")}"></label>
      <label style="flex:1">여행 끝<input type="date" data-tf="end" value="${esc(t.end || "")}"></label>
    </div>
    <label>주로 머무는 도시 (나머지 날)<select data-tf="base">${cityOptions(t.base)}</select></label>
    <div class="field-l">다른 도시에 머무는 날</div>
    <div class="trip-stops">${(t.stops || []).map((s, k) => `<div class="trip-stop">
      <select data-ts="${k}|city" aria-label="도시">${cityOptions(s.city)}</select>
      <input type="date" data-ts="${k}|from" value="${esc(s.from || "")}" aria-label="시작">
      <span>~</span>
      <input type="date" data-ts="${k}|to" value="${esc(s.to || "")}" aria-label="끝">
      <button type="button" class="btn icon" data-tsdel="${k}" aria-label="이 구간 지우기">${icon("x", 15)}</button></div>`).join("")}</div>
    <button type="button" class="btn sm" data-trip="addStop">${icon("plus", 15)} 다른 도시 추가</button>
    <div class="trip-preview">${validTrip(t) ? `<b>${n}일</b> · ${segs.map(s => `${esc(flag(s.city))} ${esc(cityName(s.city))} <small>${rangeText(s)}</small>`).join(" › ")}`
      : `<span class="muted">시작일과 끝나는 날을 정해 주세요.</span>`}</div>
    <p class="hint">도시를 옮기는 날(이동일)은 도착하는 도시로 넣으면 그날 일정이 도착 도시 지도에 보여요. 날짜를 바꿔도 같은 날짜에 담아 둔 장소는 그대로 남아요.</p>`;
}
export function openTripDlg() {
  draft = blankDraft();
  document.getElementById("tripDel").hidden = !hasTrip();
  renderDlg();
  document.getElementById("tripDlg").showModal();
}
function saveTrip() {
  const t = draft;
  if (!validTrip(t)) return toast("여행 시작일과 끝나는 날을 확인해 주세요");
  if (tripDates(t).length > 60) return toast("일정표는 60일까지 만들 수 있어요");
  t.stops = (t.stops || []).filter(s => s.city && s.from && s.to && s.to >= s.from);
  const out = t.stops.find(s => s.from < t.start || s.to > t.end);
  if (out) return toast(`${cityName(out.city)} 날짜가 여행 기간 밖이에요`);
  app.trip = { start: t.start, end: t.end, base: t.base, stops: t.stops };
  applyTrip(); save();
  document.getElementById("tripDlg").close();
  const segs = segments();
  if (!segs.some(s => s.city === CITY.id)) switchCity(segs[0].city); else refreshCity(false);
  renderPrep();
  toast(`일정표를 저장했어요 · ${segs.map(s => cityName(s.city)).join(" → ")}`);
}

export function bindTrip() {
  document.addEventListener("click", e => {
    const c = e.target.closest("[data-tripcity]");
    if (c) { if (c.dataset.tripcity !== CITY.id) switchCity(c.dataset.tripcity); return; }
    const b = e.target.closest("[data-trip]"); if (!b) return;
    if (b.dataset.trip === "edit") return openTripDlg();
    if (b.dataset.trip === "addStop") {
      const used = new Set([draft.base, ...(draft.stops || []).map(s => s.city)]);
      const city = Object.keys(allCities()).find(id => !used.has(id)) || draft.base;
      const from = draft.start ? isoAdd(draft.start, 1) : "";
      draft.stops = [...(draft.stops || []), { city, from, to: from }];
      return renderDlg();
    }
  });
  const dlg = document.getElementById("tripDlg");
  dlg.addEventListener("change", e => {
    const f = e.target.dataset.tf, s = e.target.dataset.ts;
    if (f) draft[f] = e.target.value;
    if (f === "start" && draft.end && draft.end < draft.start) draft.end = draft.start;
    if (s) { const [k, key] = s.split("|"); draft.stops[+k][key] = e.target.value; if (key === "from" && draft.stops[+k].to < e.target.value) draft.stops[+k].to = e.target.value; }
    if (f || s) renderDlg();
  });
  dlg.addEventListener("click", e => {
    const d = e.target.closest("[data-tsdel]");
    if (d) { draft.stops.splice(+d.dataset.tsdel, 1); renderDlg(); }
  });
  document.getElementById("tripSave").onclick = saveTrip;
  document.getElementById("tripCancel").onclick = () => dlg.close();
  document.getElementById("tripDel").onclick = () => {
    if (!confirm("여러 도시 일정표를 없앨까요?\n도시마다 담아 둔 장소는 그대로 남아요.")) return;
    app.trip = null; applyTrip(); save(); dlg.close(); refreshCity(false); renderPrep();
  };
}
