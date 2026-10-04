import { toast } from "./actions.js";
import { bookingChips, bookingsCardHtml, dateOfDay } from "./bookings.js";
import { renderCityBar } from "./cities.js";
import { icon } from "./icons.js";
import { ME, PARTNER, nameOf } from "./pick.js";
import { dayLabel, renderDays } from "./render.js";
import { byId, esc, gQuery, save, state } from "./store.js";

// 준비 탭: D-day, 함께 쓰는 예산·지출(누가 냈는지, 반반 정산), 출발 전 체크리스트
// 그리고 여행 중 "오늘" 카드(일정 탭 맨 위)

/* ---------- 날짜 ---------- */
const DAY = 86400000;
const localDate = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export function todayStr(now = new Date()) {
  const p = n => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}
// 출발까지 남은 날 (오늘 출발이면 0, 지났으면 음수). 출발일이 없으면 null
export function daysLeft() {
  if (!state.startDate) return null;
  return Math.round((localDate(state.startDate) - localDate(todayStr())) / DAY);
}
// 여행 중이면 오늘이 며칠째인지(0부터), 아니면 null
export function tripDay() {
  const d = daysLeft();
  return d !== null && d <= 0 && -d < state.days.length ? -d : null;
}

/* ---------- 돈 ---------- */
export const CURRENCIES = { AUD: "호주 달러", KRW: "원", USD: "미국 달러", JPY: "엔", EUR: "유로", NZD: "뉴질랜드 달러", GBP: "파운드", THB: "바트", VND: "동" };
export const EXP_CATS = {
  flight: { label: "항공",     icon: "plane",    color: "#1c7ed6" },
  stay:   { label: "숙소",     icon: "bed",      color: "#7048e8" },
  food:   { label: "식비",     icon: "utensils", color: "#c2255c" },
  move:   { label: "교통",     icon: "tram",     color: "#0b7285" },
  fun:    { label: "관광·체험", icon: "sparkles", color: "#e8590c" },
  shop:   { label: "쇼핑",     icon: "bag",      color: "#d6336c" },
  etc:    { label: "기타",     icon: "receipt",  color: "#868e96" },
};
export function money(n, cur = state.currency || "AUD") {
  const frac = cur === "KRW" || cur === "JPY" || cur === "VND" || !((n || 0) % 1) ? 0 : 2;   // 소수점은 센트가 있을 때만
  try { return new Intl.NumberFormat("ko-KR", { style: "currency", currency: cur, minimumFractionDigits: frac, maximumFractionDigits: frac }).format(n || 0); }
  catch (e) { return `${Math.round(n || 0).toLocaleString()} ${cur}`; }
}
const won = n => state.fx > 0 && state.currency !== "KRW" ? `≈ ${Math.round(n * state.fx).toLocaleString("ko-KR")}원` : "";
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export function totals() {
  const ex = state.expenses || [];
  const sum = ex.reduce((a, e) => a + (+e.amount || 0), 0);
  const byCat = {};
  ex.forEach(e => { byCat[e.cat || "etc"] = (byCat[e.cat || "etc"] || 0) + (+e.amount || 0); });
  const paid = who => ex.filter(e => e.paidBy === who).reduce((a, e) => a + (+e.amount || 0), 0);
  return { sum, byCat, mine: paid(ME), theirs: PARTNER ? paid(PARTNER) : 0 };
}
// 각자 낸 돈을 반반으로 맞추려면 누가 누구에게 얼마를 보내면 되는지 (같이 낸 돈은 빼고)
export function settle() {
  const t = totals();
  const half = (t.mine - t.theirs) / 2;
  if (!PARTNER || Math.abs(half) < 0.005) return null;
  return half > 0 ? { from: PARTNER, to: ME, amount: half } : { from: ME, to: PARTNER, amount: -half };
}

/* ---------- 체크리스트 기본 목록 ---------- */
// due: 출발 며칠 전까지 하면 좋은지
const TEMPLATE = [
  ["여권 유효기간 6개월 이상 남았는지 확인", 90],
  ["항공권 예약 (이름 철자는 여권과 똑같이)", 90],
  ["숙소 예약 확정", 60],
  ["호주 ETA(전자여행허가) 신청 — 'AustralianETA' 앱", 30],
  ["여행자 보험 가입", 30],
  ["꼭 가고 싶은 곳 예약 (공연·레스토랑·투어)", 30],
  ["트래블 카드 만들고 환전", 14],
  ["eSIM·유심·로밍 준비", 7],
  ["돼지코 어댑터 (호주는 I 타입)", 7],
  ["항공권·숙소·보험 서류 휴대폰에 저장", 3],
  ["온라인 체크인", 1],
  ["여권·지갑·충전기 마지막 확인", 0],
];
export const GROUPS = [[60, "두 달 전까지"], [30, "한 달 전까지"], [7, "일주일 전까지"], [1, "출발 직전"], [-1, "언제든"]];
const groupOf = due => GROUPS.find(([d]) => (due ?? -1) >= d) || GROUPS[GROUPS.length - 1];

/* ---------- 그리기 ---------- */
export function renderPrep() {
  const el = document.getElementById("pane-prep"); if (!el) return;
  const setOpen = !!el.querySelector(".budget-set[open]");   // 다시 그려도 펼친 설정은 그대로
  const left = daysLeft(), today = tripDay();
  const t = totals(), budget = +state.budget || 0, cur = state.currency || "AUD";
  const pct = budget ? Math.min(100, Math.round(t.sum / budget * 100)) : 0;
  const s = settle();
  const list = state.checklist || [];
  const doneN = list.filter(c => c.done).length;

  const hero = left === null
    ? `<div class="dday-hero"><div><small>출발일을 정하면</small><b>D-day</b></div><label class="field"><span>출발일</span><input type="date" data-prep="startDate"></label></div>`
    : `<div class="dday-hero ${today !== null ? "on-trip" : ""}">
        <div><small>${today !== null ? "여행 중" : left > 0 ? "출발까지" : "다녀온 지"}</small>
        <b>${today !== null ? `${today + 1}일째` : left > 0 ? `D-${left}` : left === 0 ? "D-Day" : `${-left - state.days.length + 1}일`}</b></div>
        <div class="dday-meta">${esc(dayLabel(0).replace(/^Day 1 · /, ""))} 출발 · ${state.days.length}일<br>
        ${list.length ? `준비 ${doneN}/${list.length}` : ""}</div>
      </div>`;

  const bars = Object.entries(EXP_CATS).filter(([k]) => t.byCat[k]).map(([k, c]) =>
    `<span style="flex:${t.byCat[k]};background:${c.color}" title="${c.label} ${money(t.byCat[k])}"></span>`).join("");
  const legend = Object.entries(EXP_CATS).filter(([k]) => t.byCat[k]).map(([k, c]) =>
    `<span class="lg"><i style="background:${c.color}"></i>${c.label} ${money(t.byCat[k])}</span>`).join("");
  const rows = [...(state.expenses || [])].sort((a, b) => (b.at || 0) - (a.at || 0)).map(e => {
    const c = EXP_CATS[e.cat] || EXP_CATS.etc;
    const who = nameOf(e.paidBy);
    return `<div class="exp" data-exp="${esc(e.id)}" style="--c:${c.color}">
      <span class="cat-ico">${icon(c.icon, 18)}</span>
      <div class="txt"><b>${esc(e.title || c.label)}</b><span>${[c.label, e.day != null && state.days[e.day] ? `Day ${e.day + 1}` : "", who ? `${esc(who)} 냄` : ""].filter(Boolean).join(" · ")}</span></div>
      <b class="amt">${money(e.amount)}</b></div>`;
  }).join("");

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
    ${bookingsCardHtml()}
    <section class="card">
      <div class="card-h">${icon("wallet", 18)}<b>예산·지출</b>
        <button class="btn sm primary" data-act="addExp">${icon("plus", 15)}지출</button></div>
      <div class="budget">
        <div class="budget-n"><b>${money(t.sum)}</b><span>${budget ? `/ ${money(budget)}` : "썼어요"}</span></div>
        ${budget ? `<div class="budget-left ${t.sum > budget ? "over" : ""}">${t.sum > budget ? `${money(t.sum - budget)} 초과` : `${money(budget - t.sum)} 남음`}</div>` : ""}
      </div>
      ${won(t.sum) ? `<p class="hint">${won(t.sum)}</p>` : ""}
      ${budget ? `<div class="meter" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>` : ""}
      ${bars ? `<div class="stack">${bars}</div><div class="legend">${legend}</div>` : ""}
      ${PARTNER ? `<div class="settle">${icon("users", 16)} ${s ? (s.from === ME ? `내가 <b>${esc(nameOf(s.to))}</b>에게` : `<b>${esc(nameOf(s.from))}</b>이(가) 나에게`) + ` <b>${money(s.amount)}</b> 보내면 반반이에요` : "지금은 반반이 맞아요"}
        <small>나 ${money(t.mine)} · ${esc(nameOf(PARTNER))} ${money(t.theirs)}</small></div>` : ""}
      <details class="budget-set" ${setOpen ? "open" : ""}><summary>예산·통화 설정</summary>
        <div class="row">
          <label class="field inline"><span>총예산</span><input type="number" min="0" step="1" data-prep="budget" value="${budget || ""}" placeholder="0"></label>
          <label class="field inline"><span>통화</span><select data-prep="currency">${Object.entries(CURRENCIES).map(([k, v]) => `<option value="${k}" ${k === cur ? "selected" : ""}>${k} ${v}</option>`).join("")}</select></label>
          ${cur !== "KRW" ? `<label class="field inline"><span>1 ${cur} =</span><input type="number" min="0" step="0.01" data-prep="fx" value="${state.fx || ""}" placeholder="900"> 원</label>` : ""}
        </div>
      </details>
      <div class="exp-list">${rows || `<p class="muted">아직 기록한 지출이 없어요. 항공·숙소처럼 미리 낸 돈부터 넣어 보세요.</p>`}</div>
    </section>
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
    </section>`;
  const sd = el.querySelector('[data-prep="startDate"]'); if (sd) sd.value = state.startDate || "";
}

/* ---------- 여행 중: 오늘 카드 (일정 탭 위) ---------- */
export function todayCardHtml() {
  const i = tripDay(); if (i === null) return "";
  const d = state.days[i], stops = d.stops.map(byId).filter(Boolean);
  const times = d.times || {};
  const now = new Date(), hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  // 다음 장소: 시간이 적힌 곳 중 아직 안 지난 첫 곳, 없으면 첫 장소
  const next = stops.find(p => times[p.id] && times[p.id] >= hm) || (stops.some(p => times[p.id]) ? null : stops[0]);
  const spent = (state.expenses || []).filter(e => e.day === i).reduce((a, e) => a + (+e.amount || 0), 0);
  // 출발지를 비우면 구글맵이 현재 위치에서 길을 찾음
  const url = next ? "https://www.google.com/maps/dir/?" + new URLSearchParams({ api: "1", destination: gQuery(next), travelmode: state.mode || "transit" }) : null;
  return `<div class="today">
    <div class="today-h"><span class="pill">오늘</span><b>${esc(dayLabel(i))}</b></div>
    ${next ? `<div class="today-next">다음 장소 <b>${esc(next.name)}</b>${times[next.id] ? ` · ${esc(times[next.id])}` : ""}</div>`
      : stops.length ? `<div class="today-next">오늘 일정을 다 돌았어요</div>` : `<div class="today-next">오늘은 아직 일정이 없어요</div>`}
    ${bookingChips(dateOfDay(i))}
    <div class="row">
      ${url ? `<a class="btn primary sm" href="${esc(url)}" target="_blank" rel="noopener">${icon("navigation", 15)}길안내</a>` : ""}
      <button class="btn sm" data-act="addExpToday">${icon("receipt", 15)}지출 기록</button>
      <span class="muted">${spent ? `오늘 ${money(spent)}` : ""}</span>
    </div></div>`;
}

/* ---------- 지출 입력 창 ---------- */
function openExp(id, preset = {}) {
  const dlg = document.getElementById("expDlg"), f = document.getElementById("expForm");
  const e = id ? (state.expenses || []).find(x => x.id === id) : null;
  f.reset();
  dlg.dataset.id = e ? e.id : "";
  document.getElementById("expDlgTitle").textContent = e ? "지출 고치기" : "지출 기록";
  document.getElementById("expDel").hidden = !e;
  f.cat.innerHTML = Object.entries(EXP_CATS).map(([k, c]) => `<option value="${k}">${c.label}</option>`).join("");
  f.day.innerHTML = `<option value="">여행 전·날짜 없음</option>` + state.days.map((_, i) => `<option value="${i}">${esc(dayLabel(i))}</option>`).join("");
  const who = [[ME, "나"], ...(PARTNER ? [[PARTNER, nameOf(PARTNER)]] : []), ["both", "같이(공동)"]];
  f.querySelector(".who").innerHTML = who.map(([v, l], k) => `<label class="seg-opt"><input type="radio" name="paidBy" value="${esc(v)}" ${k === 0 ? "checked" : ""}><span>${esc(l)}</span></label>`).join("");
  document.getElementById("expCur").textContent = state.currency || "AUD";
  const v = Object.assign({ cat: "food", day: tripDay() }, preset, e || {});
  f.title.value = v.title || ""; f.amount.value = v.amount ?? ""; f.cat.value = v.cat;
  f.day.value = v.day ?? "";
  const r = f.querySelector(`[name=paidBy][value="${CSS.escape(v.paidBy || ME)}"]`); if (r) r.checked = true;
  dlg.showModal();
  setTimeout(() => f.amount.focus(), 50);
}
function submitExp() {
  const dlg = document.getElementById("expDlg"), f = document.getElementById("expForm");
  const amount = parseFloat(f.amount.value);
  if (!(amount > 0)) { f.amount.focus(); return toast("금액을 넣어 주세요"); }
  const data = { title: f.title.value.trim(), amount: Math.round(amount * 100) / 100, cat: f.cat.value,
    paidBy: (f.querySelector("[name=paidBy]:checked") || {}).value || ME, day: f.day.value === "" ? null : +f.day.value };
  state.expenses = state.expenses || [];
  const e = state.expenses.find(x => x.id === dlg.dataset.id);
  if (e) Object.assign(e, data); else state.expenses.push({ id: uid("e"), at: Date.now(), ...data });
  save(); dlg.close(); renderPrep(); refreshToday();
}
function refreshToday() { const el = document.getElementById("todayCard"); if (el) el.innerHTML = todayCardHtml(); }

export function bindPrep() {
  const el = document.getElementById("pane-prep");
  el.addEventListener("click", e => {
    const t = e.target.closest("[data-act],[data-ck],[data-ckdel],[data-exp]"); if (!t) return;
    if (t.dataset.act === "addExp") return openExp(null);
    if (t.dataset.act === "ckTemplate") {
      state.checklist = (state.checklist || []).concat(TEMPLATE.map(([text, due], k) => ({ id: uid("c"), text, due, done: false, at: Date.now() + k })));
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
    if (t.dataset.exp) return openExp(t.dataset.exp);
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
    const k = e.target.dataset.prep; if (!k) return;
    const v = e.target.value;
    if (k === "startDate") state.startDate = v;
    else if (k === "currency") state.currency = v;
    else state[k] = Math.max(0, parseFloat(v) || 0);
    save(); renderPrep();
    if (k === "startDate") { renderDays(); renderCityBar(); }
  });
  document.getElementById("days").parentElement.addEventListener("click", e => {
    if (e.target.closest('[data-act="addExpToday"]')) openExp(null, { day: tripDay() });
  });
  const dlg = document.getElementById("expDlg");
  document.getElementById("expForm").addEventListener("submit", e => { e.preventDefault(); submitExp(); });
  document.getElementById("expCancel").onclick = () => dlg.close();
  document.getElementById("expDel").onclick = () => {
    state.expenses = (state.expenses || []).filter(x => x.id !== dlg.dataset.id);
    save(); dlg.close(); renderPrep(); refreshToday();
  };
}
