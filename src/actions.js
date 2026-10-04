import { addCity, deleteCity, refreshCity, renderCityBar, switchCity } from "./cities.js";
import { CATS } from "./data.js";
import { GMODE } from "./google.js";
import { M, USER_KEY } from "./map.js";
import { addMode, buildMarkers, dayLabel, drawRoutes, filter, googleSearch, openPlace, renderChips, renderDays, setAddModeFlag, showGooglePlace } from "./render.js";
import { airbnbSearchUrl, chooseStay, openStayDlg, pickFn, removeStay, renderStays, setPickFn, submitStay } from "./stays.js";
import { CITY, SAMPLE, app, byId, replaceApp, resetCityPlan, save, setCityPlan, state, tempPlaces } from "./store.js";

/* ============================== 동작 ============================== */
export function saveTemp(id, quiet) {
  const p = tempPlaces[id]; if (!p) return;
  delete tempPlaces[id];
  if (!state.custom.some(c => c.id === id)) state.custom.push({ ...p });
  if (!state.cats.includes("mine")) state.cats.push("mine");
  save(); buildMarkers(); renderChips(); filter();
  if (!quiet) { M.closePopup(); toast(`⭐ ${p.name} 저장했어요`); }
}
export function addToDay(id, day) {
  const d = state.days[day]; if (!d) return;
  if (tempPlaces[id]) saveTemp(id, true);
  if (!d.stops.includes(id)) d.stops.push(id);
  save(); renderDays(); M.closePopup();
  toast(`${byId(id).name} → ${dayLabel(day)}에 추가했어요`);
}
export function removeCustom(id) {
  if (!confirm("이 장소를 삭제할까요?")) return;
  state.custom = state.custom.filter(p => p.id !== id);
  state.days.forEach(d => d.stops = d.stops.filter(s => s !== id));
  save(); M.closePopup(); buildMarkers(); renderDays();
}
window.addToDay = addToDay; window.removeCustom = removeCustom; window.saveTemp = saveTemp;

export let toastT;
export function toast(msg) {
  const b = document.getElementById("banner");
  b.textContent = msg; b.style.display = "block";
  clearTimeout(toastT);
  if (!addMode) toastT = setTimeout(() => b.style.display = "none", 2200);
}
export function setAddMode(v, msg) {
  setAddModeFlag(v);
  const cancelled = !v && pickFn;
  if (!v) setPickFn(null);
  document.getElementById("btnAddMode").classList.toggle("active", v);
  M.cursor(v ? "crosshair" : "");
  const b = document.getElementById("banner");
  clearTimeout(toastT);
  if (v) { b.textContent = msg || "지도를 클릭해 장소를 추가하세요 (Esc 취소)"; b.style.display = "block"; }
  else b.style.display = "none";
  if (cancelled) toast("위치를 찍지 않아 취소했어요");
}

export function bindUI() {
  document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => {
    document.querySelectorAll(".tabs button").forEach(x => x.classList.toggle("on", x === b));
    document.querySelectorAll(".pane").forEach(p => p.classList.toggle("on", p.id === "pane-" + b.dataset.tab));
  });
  document.getElementById("citySel").onchange = e => e.target.value === "__add" ? addCity() : switchCity(e.target.value);
  document.getElementById("btnCityDel").onclick = deleteCity;
  document.getElementById("q").oninput = filter;
  document.getElementById("btnAirbnb").onclick = () => window.open(airbnbSearchUrl(), "_blank", "noopener");
  document.getElementById("guests").onchange = e => { state.guests = +e.target.value; save(); };
  document.getElementById("staySort").onchange = e => { state.staySort = e.target.value; save(); renderStays(); };
  document.getElementById("btnAddStay").onclick = () => openStayDlg();
  document.getElementById("stayCancel").onclick = () => document.getElementById("stayDlg").close();
  document.getElementById("stayForm").onsubmit = submitStay;
  document.getElementById("stayList").onclick = e => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const id = b.dataset.id;
    ({ open: () => openPlace(id), choose: () => chooseStay(id), edit: () => openStayDlg(id), del: () => removeStay(id) })[b.dataset.act]();
  };
  document.getElementById("q").onkeydown = e => { if (e.key === "Enter" && GMODE) googleSearch(); };
  document.getElementById("btnGSearch").onclick = googleSearch;
  document.getElementById("gResults").onclick = e => {
    if (e.target.closest("[data-gclose]")) return document.getElementById("gResults").innerHTML = "";
    const el = e.target.closest(".gres"); if (el) openPlace(el.dataset.id);
  };
  document.getElementById("chips").onclick = e => {
    const c = e.target.closest(".chip"); if (!c) return;
    const k = c.dataset.cat;
    if (k === "__all") state.cats = state.cats.length === Object.keys(CATS).length ? [] : Object.keys(CATS);
    else state.cats = state.cats.includes(k) ? state.cats.filter(x => x !== k) : state.cats.concat(k);
    save(); renderChips(); filter();
  };
  document.getElementById("list").onclick = e => {
    const el = e.target.closest(".place"); if (el) openPlace(el.dataset.id);
  };

  document.getElementById("startDate").onchange = e => { state.startDate = e.target.value; save(); renderDays(); renderCityBar(); };
  document.getElementById("mode").onchange = e => { state.mode = e.target.value; save(); renderDays(); };
  document.getElementById("routesOn").onchange = e => { state.routesOn = e.target.checked; save(); drawRoutes(); };
  document.getElementById("dayPlus").onclick = () => { if (state.days.length < 21) { state.days.push({ stops:[], note:"" }); save(); renderDays(); } };
  document.getElementById("dayMinus").onclick = () => {
    if (state.days.length <= 1) return;
    const last = state.days[state.days.length-1];
    if ((last.stops.length || last.note) && !confirm("마지막 날의 일정이 삭제됩니다. 계속할까요?")) return;
    state.days.pop();
    if (state.focusDay !== null && state.focusDay >= state.days.length) state.focusDay = null;
    save(); renderDays();
  };

  const daysEl = document.getElementById("days");
  daysEl.onclick = e => {
    const t = e.target.closest("[data-open],[data-mv],[data-rm],[data-shift],[data-focus]"); if (!t) return;
    if (t.dataset.open) return openPlace(t.dataset.open);
    if (t.dataset.focus !== undefined) {
      const i = +t.dataset.focus;
      state.focusDay = state.focusDay === i ? null : i;
      save(); renderDays();
      if (state.focusDay !== null) M.fit(state.days[i].stops.map(byId).filter(Boolean));
      return;
    }
    if (t.dataset.mv) {
      const [i,j,dir] = t.dataset.mv.split(",").map(Number); const s = state.days[i].stops;
      [s[j], s[j+dir]] = [s[j+dir], s[j]];
    } else if (t.dataset.rm) {
      const [i,j] = t.dataset.rm.split(",").map(Number); state.days[i].stops.splice(j,1);
    } else if (t.dataset.shift) {
      const [i,j] = t.dataset.shift.split(",").map(Number);
      const to = prompt(`몇 일차로 옮길까요? (1~${state.days.length})`, String(i+2 > state.days.length ? 1 : i+2));
      const k = parseInt(to, 10) - 1;
      if (!(k >= 0 && k < state.days.length) || k === i) return;
      const [id] = state.days[i].stops.splice(j,1);
      if (!state.days[k].stops.includes(id)) state.days[k].stops.push(id);
    }
    save(); renderDays();
  };
  daysEl.oninput = e => {
    if (e.target.dataset.note !== undefined) { state.days[+e.target.dataset.note].note = e.target.value; save(); }
    if (e.target.dataset.time) {
      const [i, id] = e.target.dataset.time.split("|"); const d = state.days[+i];
      d.times = d.times || {};
      if (e.target.value) d.times[id] = e.target.value; else delete d.times[id];
      save();
    }
  };

  document.getElementById("btnSample").onclick = () => {
    if (state.days.some(d => d.stops.length) && !confirm("현재 일정을 추천 일정으로 바꿀까요?")) return;
    if (!SAMPLE) return;
    state.days = SAMPLE.map(d => ({ stops:[...d.stops], note:d.note }));
    state.focusDay = null; save(); renderDays();
    const far = new Set(["blueview", "m_gor", "m_phillip", "m_yarra", "c_mossman"]);
    M.fit(state.days.flatMap(d => d.stops).map(byId).filter(p => p && !far.has(p.id)));
  };
  document.getElementById("btnReset").onclick = () => {
    if (!confirm(`${CITY.name}의 일정·내 장소·숙소 후보를 모두 초기화할까요?`)) return;
    resetCityPlan(); save(); refreshCity(false);
  };
  document.getElementById("btnExport").onclick = () => {
    // 모든 도시의 일정을 한 파일로
    const blob = new Blob([JSON.stringify(app, null, 2)], { type:"application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = "honeymoon-plan.json"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  document.getElementById("btnImport").onclick = () => document.getElementById("importFile").click();
  document.getElementById("importFile").onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const s = JSON.parse(await f.text());
      if (s && s.plans) replaceApp(s);   // 전체 (v2)
      else if (s && Array.isArray(s.days)) setCityPlan(s); // 한 도시 (v1)
      else throw 0;
      save(); refreshCity(true);
      toast("일정을 불러왔어요");
    } catch (err) { alert("올바른 일정 파일이 아닙니다."); }
    e.target.value = "";
  };

  document.getElementById("btnAddMode").onclick = () => setAddMode(!addMode);
  document.addEventListener("keydown", e => { if (e.key === "Escape" && addMode) setAddMode(false); });
  M.onClick(pos => {
    if (pickFn) { const f = pickFn; setPickFn(null); setAddMode(false); f(pos); return; }
    if (!addMode) { if (pos.placeId) showGooglePlace(pos.placeId, pos); return; }
    const name = prompt("장소 이름을 입력하세요 (예: 우리 숙소, 웨딩 촬영지)");
    setAddMode(false);
    if (!name) return;
    const desc = prompt("메모 (선택)") || "";
    const p = { id:"c" + Date.now().toString(36), cat:"mine", name:name.trim(), desc, lat:+pos.lat.toFixed(6), lng:+pos.lng.toFixed(6), area:"" };
    state.custom.push(p);
    if (!state.cats.includes("mine")) state.cats.push("mine");
    save(); buildMarkers(); renderChips(); filter(); openPlace(p.id, false);
  });

  const dlg = document.getElementById("settings");
  document.getElementById("btnSettings").onclick = () => {
    document.getElementById("keyStatus").textContent = !GMODE ? "지금은 기본 무료 지도로 표시하고 있어요."
      : USER_KEY ? "테스트용 키로 구글 지도를 쓰고 있어요." : "구글 지도·실제 경로·장소 정보가 켜져 있어요. 따로 설정할 것은 없어요.";
    document.getElementById("apiKey").value = USER_KEY;
    dlg.showModal();
  };
  document.getElementById("setCancel").onclick = () => dlg.close();
  document.getElementById("setSave").onclick = () => {
    const k = document.getElementById("apiKey").value.trim();
    try { k ? localStorage.setItem("gmaps-key", k) : localStorage.removeItem("gmaps-key"); } catch (e) {}
    const u = new URL(location.href); u.searchParams.delete("key"); u.searchParams.delete("nokey"); location.href = u.toString();
  };
}
