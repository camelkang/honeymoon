import { toast } from "./actions.js";
import { bookingChips, bookingsCardHtml } from "./bookings.js";
import { renderCityBar } from "./cities.js";
import { recapHtml } from "./diary.js";
import { icon } from "./icons.js";
import { offlineCardHtml } from "./offline.js";
import { inBase, ledgerMiniHtml, money, renderLedger, spending } from "./ledger.js";
import { ME, nameOf } from "./pick.js";
import { dayLabel, renderDays } from "./render.js";
import { CITY, allCities, app, byId, dateOfDay, esc, gQuery, save, state } from "./store.js";
import { hasTrip, segments, tripDates } from "./trip.js";
import { weatherChip } from "./weather.js";

// 준비 탭: D-day, 가계부 요약(자세한 건 가계부 탭 ledger.js), 출발 전 체크리스트
// 그리고 여행 중 "오늘" 카드(일정 탭 맨 위)

/* ---------- 날짜 ---------- */
const DAY = 86400000;
const localDate = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export function todayStr(now = new Date()) {
  const p = n => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
// 출발까지 남은 날 (오늘 출발이면 0, 지났으면 음수). 출발일이 없으면 null
// 여러 도시 일정이면 전체 여행의 첫날 기준
export function daysLeft() {
  const start = hasTrip() ? app.trip.start : state.startDate;
  if (!start) return null;
  return Math.round((localDate(start) - localDate(todayStr())) / DAY);
}
export const tripLength = () => hasTrip() ? tripDates().length : state.days.length;
// 이 도시 일정에서 오늘이 몇 번째 칸인지(0부터), 오늘이 이 도시 날이 아니면 null
export function tripDay() {
  const today = todayStr(), k = state.days.findIndex((_, i) => dateOfDay(i) === today);
  return k < 0 ? null : k;
}

const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* ---------- 체크리스트 기본 목록 ---------- */
// due: 출발 며칠 전까지 하면 좋은지
const TEMPLATE = [
  ["여권 유효기간 6개월 이상 남았는지 확인", 90],
  ["항공권 예약 (이름 철자는 여권과 똑같이)", 90],
  ["숙소 예약 확정", 60],
  [() => CITY.visa || "입국 조건(비자·전자여행허가) 확인", 30],
  ["여행자 보험 가입", 30],
  ["꼭 가고 싶은 곳 예약 (공연·레스토랑·투어)", 30],
  ["트래블 카드 만들고 환전", 14],
  ["eSIM·유심·로밍 준비", 7],
  [() => `전원 어댑터 챙기기${CITY.plug ? ` (${CITY.name}: ${CITY.plug})` : ""}`, 7],
  ["항공권·숙소·보험 서류 휴대폰에 저장", 3],
  ["온라인 체크인", 1],
  ["여권·지갑·충전기 마지막 확인", 0],
];
export const GROUPS = [[60, "두 달 전까지"], [30, "한 달 전까지"], [7, "일주일 전까지"], [1, "출발 직전"], [-1, "언제든"]];
const groupOf = due => GROUPS.find(([d]) => (due ?? -1) >= d) || GROUPS[GROUPS.length - 1];

/* ---------- 그리기 ---------- */
export function renderPrep() {
  renderLedger();   // 가계부 탭도 같이 (지출·예산이 바뀌면 둘 다 바뀜)
  const el = document.getElementById("pane-prep"); if (!el) return;
  const guideOpen = new Set([...el.querySelectorAll(".guide details[open]")].map(d => d.dataset.g));
  const left = daysLeft();
  const list = state.checklist || [];
  const doneN = list.filter(c => c.done).length;

  const total = tripLength(), onTrip = left !== null && left <= 0 && -left < total;
  const route = hasTrip() ? segments().map(sg => (allCities()[sg.city] || {}).name).filter(Boolean).join(" → ") : "";
  const startLabel = (() => { const s = hasTrip() ? app.trip.start : state.startDate; if (!s) return ""; const d = new Date(s + "T00:00:00"); return `${d.getMonth() + 1}/${d.getDate()}(${"일월화수목금토"[d.getDay()]})`; })();
  const hero = left === null
    ? `<div class="dday-hero"><div><small>출발일을 정하면</small><b>D-day</b></div><label class="field"><span>출발일</span><input type="date" data-prep="startDate"></label></div>`
    : `<div class="dday-hero ${onTrip ? "on-trip" : ""}">
        <div><small>${onTrip ? "여행 중" : left > 0 ? "출발까지" : "다녀온 지"}</small>
        <b>${onTrip ? `${-left + 1}일째` : left > 0 ? `D-${left}` : left === 0 ? "D-Day" : `${-left - total + 1}일`}</b></div>
        <div class="dday-meta">${esc(startLabel)} 출발 · ${total}일<br>${route ? `${esc(route)}<br>` : ""}
        ${list.length ? `준비 ${doneN}/${list.length}` : ""}</div>
      </div>`;

  const groups = GROUPS.map(([d, label]) => {
    const items = list.filter(c => groupOf(c.due)[0] === d).sort((a, b) => (b.due ?? -1) - (a.due ?? -1) || (a.at || 0) - (b.at || 0));
    if (!items.length) return "";
    return `<h4 class="ck-g">${label}</h4>` + items.map(c => {
      const late = !c.done && left !== null && c.due != null && c.due >= 0 && left < c.due;
      const by = c.done && c.doneBy ? nameOf(c.doneBy) : "";
      return `<div class="ck ${c.done ? "done" : ""} ${late ? "late" : ""}">
        <button class="ck-box" data-ck="${esc(c.id)}" role="checkbox" aria-checked="${!!c.done}" aria-label="${esc(c.text)}">${icon(c.done ? "checkSquare" : "square", 20)}</button>
        <span class="ck-t"><span class="ck-x">${esc(c.text)}</span>${by ? `<small>${esc(by)} 완료</small>` : late ? `<small>늦었어요</small>` : ""}</span>
        <button class="btn icon ck-del" data-ckdel="${esc(c.id)}" aria-label="삭제">${icon("x", 14)}</button></div>`;
    }).join("");
  }).join("");

  el.innerHTML = `${hero}
    ${recapHtml()}
    ${bookingsCardHtml()}
    ${ledgerMiniHtml()}
    <section class="card">
      <div class="card-h">${icon("listChecks", 18)}<b>준비 체크리스트</b><span class="muted">${list.length ? `${doneN}/${list.length}` : ""}</span></div>
      ${list.length ? `<div class="meter thin"><span style="width:${Math.round(doneN / list.length * 100)}%"></span></div>` : ""}
      <form class="ck-add" data-act="ckAdd">
        <input type="text" name="text" placeholder="할 일 추가 (예: 커플 사진 찍을 옷 챙기기)" aria-label="할 일">
        <select name="due" aria-label="언제까지">${GROUPS.map(([d, l]) => `<option value="${d}" ${d === -1 ? "selected" : ""}>${l}</option>`).join("")}</select>
        <button class="btn primary sm" type="submit" aria-label="추가">${icon("plus", 16)}</button>
      </form>
      ${groups || `<div class="empty-big small">${icon("listChecks", 32)}<span>여권·ETA·보험처럼 출발 전에 챙길 것들을 둘이 나눠 체크해요.</span>
        <button class="btn" data-act="ckTemplate">${icon("sparkles", 16)}기본 목록 넣기</button></div>`}
    </section>
    ${guideHtml(guideOpen)}
    ${offlineCardHtml()}`;
  const sd = el.querySelector('[data-prep="startDate"]'); if (sd) sd.value = state.startDate || "";
}

// 도시별 교통·면세 같은 현지 안내 (CITY.guide가 있는 도시만)
function guideHtml(open) {
  if (!CITY.guide?.length) return "";
  return `<section class="card guide">
      <div class="card-h">${icon("train", 18)}<b>교통·면세 가이드</b></div>
      ${CITY.guide.map((g, k) => `<details data-g="${k}" ${open.has(String(k)) ? "open" : ""}><summary>${esc(g.title)}</summary>
        <ul>${g.items.map(t => `<li>${esc(t)}</li>`).join("")}</ul></details>`).join("")}
      <p class="hint">가격·규정은 바뀔 수 있어요. 출발 전 공식 사이트에서 한 번 더 확인하세요.</p>
    </section>`;
}

/* ---------- 여행 중: 오늘 카드 (일정 탭 위) ---------- */
export function todayCardHtml() {
  const i = tripDay(); if (i === null) return "";
  const d = state.days[i], stops = d.stops.map(byId).filter(Boolean);
  const times = d.times || {};
  const now = new Date(), hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  // 다음 장소: 시간이 적힌 곳 중 아직 안 지난 첫 곳, 없으면 첫 장소
  const next = stops.find(p => times[p.id] && times[p.id] >= hm) || (stops.some(p => times[p.id]) ? null : stops[0]);
  const spent = spending().filter(e => e.day === i).reduce((a, e) => a + (inBase(e) || 0), 0);
  // 출발지를 비우면 구글맵이 현재 위치에서 길을 찾음
  const url = next ? "https://www.google.com/maps/dir/?" + new URLSearchParams({ api: "1", destination: gQuery(next), travelmode: state.mode || "transit" }) : null;
  return `<div class="today">
    <div class="today-h"><span class="pill">오늘</span><b>${esc(dayLabel(i))}</b><span data-wx="${dateOfDay(i)}">${weatherChip(dateOfDay(i))}</span></div>
    ${next ? `<div class="today-next">다음 장소 <b>${esc(next.name)}</b>${times[next.id] ? ` · ${esc(times[next.id])}` : ""}</div>`
      : stops.length ? `<div class="today-next">오늘 일정을 다 돌았어요</div>` : `<div class="today-next">오늘은 아직 일정이 없어요</div>`}
    ${bookingChips(dateOfDay(i))}
    <div class="row">
      ${url ? `<a class="btn primary sm" href="${esc(url)}" target="_blank" rel="noopener">${icon("navigation", 15)}길안내</a>` : ""}
      <button class="btn sm" data-act="addExpToday">${icon("receipt", 15)}지출 기록</button>
      <span class="muted">${spent ? `오늘 ${money(spent)}` : ""}</span>
    </div></div>`;
}

export function bindPrep() {
  const el = document.getElementById("pane-prep");
  el.addEventListener("click", e => {
    const t = e.target.closest("[data-act],[data-ck],[data-ckdel]"); if (!t) return;
    if (t.dataset.act === "ckTemplate") {
      state.checklist = (state.checklist || []).concat(TEMPLATE.concat(CITY.prep || []).map(([text, due], k) => ({ id: uid("c"), text: typeof text === "function" ? text() : text, due, done: false, at: Date.now() + k })));
      save(); return renderPrep();
    }
    if (t.dataset.ck) {
      const c = state.checklist.find(x => x.id === t.dataset.ck); if (!c) return;
      c.done = !c.done; c.doneBy = c.done ? ME : null;
      save(); renderPrep();
      if (state.checklist.every(x => x.done)) toast("준비 끝! 즐거운 여행 되세요");
      return;
    }
    if (t.dataset.ckdel) { state.checklist = state.checklist.filter(x => x.id !== t.dataset.ckdel); save(); return renderPrep(); }
  });
  el.addEventListener("submit", e => {
    e.preventDefault();
    const f = e.target, text = f.text.value.trim(); if (!text) return;
    const due = +f.due.value;
    state.checklist = (state.checklist || []).concat({ id: uid("c"), text, due: due < 0 ? null : due, done: false, at: Date.now() });
    save(); renderPrep();
    const input = document.querySelector("#pane-prep .ck-add [name=text]"); if (input) input.focus();
  });
  el.addEventListener("change", e => {
    if (e.target.dataset.prep !== "startDate") return;
    state.startDate = e.target.value;
    save(); renderPrep(); renderDays(); renderCityBar();
  });
}
