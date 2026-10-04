import { addCity, renderCityBar, switchCity } from "./cities.js";
import { icon } from "./icons.js";
import { M } from "./map.js";
import { renderPrep } from "./prep.js";
import { buildMarkers, renderDays } from "./render.js";
import { showTab } from "./sheet.js";
import { CITY, SAMPLE, allCities, app, byId, esc, save, state } from "./store.js";

// 처음 연 사람을 위한 3단계 안내: 어디로 → 언제 → 짝꿍과 함께 쓸지

const KEY = "onboarded";
let step = 0, days = 5, start = "", useSample = true;

const mark = () => { try { localStorage.setItem(KEY, "1"); } catch (e) {} };
// 이미 쓰던 사람(저장된 일정이 있음)이나 초대 링크로 들어온 사람에겐 보여주지 않음
export function maybeOnboard() {
  let done = "1";
  try { done = localStorage.getItem(KEY); } catch (e) {}
  if (done) return false;
  const used = Object.values(app.plans).some(p => p.startDate || p.days.some(d => d.stops.length)
    || (p.custom || []).length || (p.stays || []).length || Object.keys(p.votes || {}).length);
  if (used || new URLSearchParams(location.search).get("join")) { mark(); return false; }
  step = 0; days = state.days.length; start = ""; useSample = true;
  render();
  document.getElementById("onboard").showModal();
  return true;
}

function render() {
  const dlg = document.getElementById("onboard");
  const dots = [0, 1, 2].map(i => `<span class="${i === step ? "on" : ""}"></span>`).join("");
  let body = "";
  if (step === 0) {
    const cities = Object.values(allCities());
    body = `<h2>어디로 떠나요?</h2><p class="muted">도시마다 일정·장소·숙소 후보가 따로 저장돼요.</p>
      <div class="ob-cities">${cities.map(c => `<button class="ob-city ${c.id === CITY.id ? "on" : ""}" data-city="${esc(c.id)}">
        <span class="flag">${esc(c.flag || "📍")}</span><b>${esc(c.name)}</b>
        <small>${c.places && c.places.length ? `추천 장소 ${c.places.length}곳` : "직접 추가한 도시"}</small></button>`).join("")}
        <button class="ob-city add" data-city="__add"><span class="flag">${icon("plus", 22)}</span><b>다른 도시</b><small>이름으로 찾아 추가</small></button>
      </div>`;
  } else if (step === 1) {
    body = `<h2>언제 떠나요?</h2><p class="muted">출발일을 정하면 날짜별 일정과 D-day가 보여요. 나중에 바꿀 수 있어요.</p>
      <label class="field"><span>출발일</span><input type="date" id="obDate" value="${esc(start)}"></label>
      <div class="field"><span>여행 일수</span>
        <div class="stepper"><button class="icon-btn sm" data-days="-1" aria-label="하루 빼기">−</button><b id="obDays">${days}</b><button class="icon-btn sm" data-days="1" aria-label="하루 더하기">+</button></div></div>
      ${SAMPLE ? `<label class="toggle ob-sample"><input type="checkbox" id="obSample" ${useSample ? "checked" : ""}><span>${esc(CITY.name)} 추천 일정으로 시작하기</span></label>` : ""}`;
  } else {
    body = `<div class="ob-hero">${icon("handshake", 44)}</div>
      <h2>짝꿍과 함께 쓸까요?</h2>
      <p class="muted">로그인하고 초대 코드를 보내면, 둘이 같은 지도와 일정을 실시간으로 함께 고칠 수 있어요.
        가고 싶은 곳을 각자 고르면 <b>둘 다 좋아한 곳</b>을 찾아줘요.</p>
      <button class="btn primary big" data-ob="invite">${icon("user", 18)}로그인하고 짝꿍 초대하기</button>
      <button class="btn big" data-ob="solo">나중에 할게요</button>
      <p class="hint">로그인하지 않아도 이 기기에서 모든 기능을 쓸 수 있어요.</p>`;
  }
  dlg.innerHTML = `<div class="ob">
    <div class="ob-top"><div class="ob-dots" aria-label="${step + 1}/3단계">${dots}</div>
      <button class="linkish" data-ob="skip">건너뛰기</button></div>
    <div class="ob-body" tabindex="-1" autofocus>${body}</div>
    ${step < 2 ? `<div class="ob-nav">${step ? `<button class="btn" data-ob="back">이전</button>` : "<span></span>"}
      <button class="btn primary" data-ob="next">${step === 1 && !start ? "날짜는 나중에" : "다음"}</button></div>` : ""}
  </div>`;
}

function applyTrip() {
  if (start) state.startDate = start;
  const want = Math.max(1, Math.min(21, days));
  if (useSample && SAMPLE && !state.days.some(d => d.stops.length)) {
    state.days = SAMPLE.slice(0, want).map(d => ({ stops: [...d.stops], note: d.note, times: {} }));
  }
  while (state.days.length < want) state.days.push({ stops: [], note: "", times: {} });
  if (state.days.length > want && !state.days.slice(want).some(d => d.stops.length || d.note)) state.days.length = want;
  save(); buildMarkers(); renderDays(); renderCityBar(); renderPrep();
  const pts = state.days.flatMap(d => d.stops).map(byId).filter(Boolean);
  if (pts.length) M.fit(pts.filter(p => Math.abs(p.lat - CITY.center.lat) < 0.3 && Math.abs(p.lng - CITY.center.lng) < 0.3));
}
function finish(then) {
  mark();
  document.getElementById("onboard").close();
  if (then === "invite") document.getElementById("btnAccount").click();
  else showTab("pick");
}

export function bindOnboard() {
  const dlg = document.getElementById("onboard");
  dlg.addEventListener("cancel", e => { e.preventDefault(); });   // Esc로 실수로 닫히지 않게 (건너뛰기 버튼 사용)
  dlg.addEventListener("input", e => {
    if (e.target.id === "obDate") { start = e.target.value; dlg.querySelector('[data-ob="next"]').textContent = start ? "다음" : "날짜는 나중에"; }
    if (e.target.id === "obSample") useSample = e.target.checked;
  });
  dlg.addEventListener("click", async e => {
    const c = e.target.closest("[data-city]");
    if (c) {
      if (c.dataset.city === "__add") { await addCity(); if (CITY.custom) { step = 1; days = state.days.length; useSample = false; } return render(); }
      switchCity(c.dataset.city);
      step = 1; days = Math.max(state.days.length, SAMPLE ? SAMPLE.length : 0) || 5;
      return render();
    }
    const d = e.target.closest("[data-days]");
    if (d) { days = Math.max(1, Math.min(21, days + +d.dataset.days)); dlg.querySelector("#obDays").textContent = days; return; }
    const b = e.target.closest("[data-ob]"); if (!b) return;
    const act = b.dataset.ob;
    if (act === "skip") return finish();
    if (act === "back") { step--; return render(); }
    if (act === "next") {
      if (step === 0) days = Math.max(state.days.length, SAMPLE ? SAMPLE.length : 0) || 5;
      if (step === 1) applyTrip();
      step++; return render();
    }
    if (act === "solo") return finish();
    if (act === "invite") return finish("invite");
  });
}
