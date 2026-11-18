import { toast } from "./actions.js";
import { icon } from "./icons.js";
import { ME, PARTNER, nameOf } from "./pick.js";
import { renderPrep, todayStr, tripDay } from "./prep.js";
import { dayLabel } from "./render.js";
import { CITY, dateOfDay, esc, save, state } from "./store.js";

// 가계부 탭: 둘이 함께 쓰는 여행 지출 장부
// - 지출마다 통화(현지/원화), 누가 냈는지, 누구 몫인지(같이·나·짝꿍), 카드/현금
// - 날짜별 묶음과 하루 합계, 분류·사람 필터, 반반 정산과 "정산 완료" 기록, CSV 내보내기
// 지출: { id, title, amount, cur?, cat, paidBy(사람|both), for?(both|사람), pay?(card|cash), day(0부터|null), at }
// 정산 기록: { id, kind: "settle", amount, paidBy(보낸 사람), to(받은 사람), day, at } — 합계에는 안 들어가고 정산에만

/* ---------- 돈 ---------- */
export const CURRENCIES = { AUD: "호주 달러", KRW: "원", USD: "미국 달러", JPY: "엔", EUR: "유로", IDR: "루피아", VND: "동", NZD: "뉴질랜드 달러", GBP: "파운드", THB: "바트", MXN: "멕시코 페소", MVR: "몰디브 루피야" };
export const EXP_CATS = {
  flight: { label: "항공",     icon: "plane",    color: "#1c7ed6" },
  stay:   { label: "숙소",     icon: "bed",      color: "#7048e8" },
  food:   { label: "식비",     icon: "utensils", color: "#c2255c" },
  move:   { label: "교통",     icon: "tram",     color: "#0b7285" },
  fun:    { label: "관광·체험", icon: "sparkles", color: "#e8590c" },
  shop:   { label: "쇼핑",     icon: "bag",      color: "#d6336c" },
  etc:    { label: "기타",     icon: "receipt",  color: "#868e96" },
};
export const PAY = { card: "카드", cash: "현금" };
export const baseCur = () => state.currency || "AUD";
export function money(n, cur = baseCur()) {
  const frac = ["KRW", "JPY", "VND", "IDR"].includes(cur) || !((n || 0) % 1) ? 0 : 2;   // 소수점은 센트가 있을 때만
  try { return new Intl.NumberFormat("ko-KR", { style: "currency", currency: cur, minimumFractionDigits: frac, maximumFractionDigits: frac }).format(n || 0); }
  catch (e) { return `${Math.round(n || 0).toLocaleString()} ${cur}`; }
}

/* ---------- 환율: 직접 넣은 값이 없으면 오늘 환율을 자동으로 (무료 API, 반나절 캐시) ---------- */
const FX_KEY = "fx-cache-v1";
let fxCache = {};
try { fxCache = JSON.parse(localStorage.getItem(FX_KEY)) || {}; } catch (e) {}
const fxLoading = new Set(), fxFailed = {};
export async function loadFx(cur) {
  if (!cur || cur === "KRW" || fxLoading.has(cur) || Date.now() - (fxFailed[cur] || 0) < 10 * 60e3) return;
  const c = fxCache[cur];
  if (c && Date.now() - c.at < 12 * 3600e3) return;
  fxLoading.add(cur);
  try {
    let rate = null, date = "";
    try {
      const j = await (await fetch(`https://open.er-api.com/v6/latest/${cur}`)).json();
      if (j.result === "success" && j.rates && j.rates.KRW) { rate = j.rates.KRW; date = (j.time_last_update_utc || "").slice(5, 16); }
    } catch (e) {}
    if (!rate) {   // 예비: 유럽중앙은행 기준 (동·루피야 등 일부 통화는 없음)
      const j = await (await fetch(`https://api.frankfurter.app/latest?from=${cur}&to=KRW`)).json();
      if (j.rates && j.rates.KRW) { rate = j.rates.KRW; date = j.date || ""; }
    }
    if (rate) {
      fxCache[cur] = { rate, date, at: Date.now() };
      try { localStorage.setItem(FX_KEY, JSON.stringify(fxCache)); } catch (e) {}
      if (baseCur() === cur) renderPrep();
    } else fxFailed[cur] = Date.now();
  } catch (e) { fxFailed[cur] = Date.now(); } finally { fxLoading.delete(cur); }
}
export const autoFx = cur => (fxCache[cur] || {}).rate || 0;
export const fxRate = () => state.fx > 0 ? state.fx : autoFx(baseCur());
export const fmtRate = r => r >= 100 ? Math.round(r).toLocaleString("ko-KR") : r >= 1 ? r.toFixed(1) : r.toFixed(3);
export const won = n => fxRate() > 0 && baseCur() !== "KRW" ? `≈ ${Math.round(n * fxRate()).toLocaleString("ko-KR")}원` : "";
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

// 지출 하나를 현지 통화(이 도시 통화)로. 원화로 적은 지출은 환율로 나눔. 환율을 아직 모르면 null
export function inBase(e) {
  const a = +e.amount || 0, cur = e.cur || baseCur();
  if (cur === baseCur()) return a;
  if (cur === "KRW") return fxRate() > 0 ? a / fxRate() : null;
  return null;
}
const val = e => inBase(e) || 0;
export const isSettle = e => e.kind === "settle";
export const spending = () => (state.expenses || []).filter(e => !isSettle(e));

export function totals() {
  const ex = spending();
  const sum = ex.reduce((a, e) => a + val(e), 0);
  const byCat = {};
  ex.forEach(e => { byCat[e.cat || "etc"] = (byCat[e.cat || "etc"] || 0) + val(e); });
  const paid = who => ex.filter(e => e.paidBy === who).reduce((a, e) => a + val(e), 0);
  const cash = ex.filter(e => e.pay === "cash").reduce((a, e) => a + val(e), 0);
  const unconverted = ex.filter(e => inBase(e) === null).length;
  return { sum, byCat, mine: paid(ME), theirs: PARTNER ? paid(PARTNER) : 0, shared: paid("both"), cash, unconverted };
}
// 짝꿍이 나에게 줘야 할 돈(음수면 내가 줘야 할 돈)
// 같이 쓴 돈은 반씩, 한 사람 몫은 그 사람이 전부 부담. 공동 지갑(both)으로 낸 돈은 정산과 무관
export function balance() {
  if (!PARTNER) return 0;
  let bal = 0;
  for (const e of state.expenses || []) {
    const v = val(e);
    if (isSettle(e)) {   // 정산 송금: 보낸 사람의 빚이 그만큼 줄어듦
      if (e.paidBy === PARTNER && e.to === ME) bal -= v;
      else if (e.paidBy === ME && e.to === PARTNER) bal += v;
      continue;
    }
    const payer = e.paidBy, other = payer === ME ? PARTNER : payer === PARTNER ? ME : null;
    if (!other) continue;
    const target = e.for || "both";
    const share = target === other ? v : target === payer ? 0 : v / 2;
    bal += payer === ME ? share : -share;
  }
  return bal;
}
// 반반(몫대로) 맞추려면 누가 누구에게 얼마를 보내면 되는지
export function settle() {
  const b = balance();
  if (!PARTNER || Math.abs(b) < 0.005) return null;
  return b > 0 ? { from: PARTNER, to: ME, amount: b } : { from: ME, to: PARTNER, amount: -b };
}
export function settleText(s) {
  return s ? (s.from === ME ? `내가 <b>${esc(nameOf(s.to))}</b>에게` : `<b>${esc(nameOf(s.from))}</b>이(가) 나에게`) + ` <b>${money(s.amount)}</b> 보내면 정산 끝이에요`
    : "지금은 정산할 돈이 없어요";
}

/* ---------- 그리기 ---------- */
const filt = { cat: "all", who: "all" };   // 목록 필터 (기기별, 저장 안 함)
const dateLabel = i => i == null || !state.days[i] ? "여행 전·날짜 없음" : dayLabel(i);

function rowHtml(e) {
  if (isSettle(e)) {
    return `<div class="exp settle-row" data-exp="${esc(e.id)}" style="--c:var(--brand)">
      <span class="cat-ico">${icon("handshake", 18)}</span>
      <div class="txt"><b>정산 ${esc(nameOf(e.paidBy) || "?")} → ${esc(nameOf(e.to) || "?")}</b><span>보낸 돈 · 합계에는 안 들어가요</span></div>
      <b class="amt">${money(e.amount)}</b></div>`;
  }
  const c = EXP_CATS[e.cat] || EXP_CATS.etc;
  const cur = e.cur || baseCur(), foreign = cur !== baseCur(), v = inBase(e);
  const forWho = e.for && e.for !== "both" ? `${nameOf(e.for) || "?"} 몫` : "";
  const meta = [c.label, nameOf(e.paidBy) ? `${nameOf(e.paidBy)} 냄` : "", forWho, PAY[e.pay] || ""].filter(Boolean).map(esc).join(" · ");
  return `<div class="exp" data-exp="${esc(e.id)}" style="--c:${c.color}">
    <span class="cat-ico">${icon(c.icon, 18)}</span>
    <div class="txt"><b>${esc(e.title || c.label)}</b><span>${meta}</span></div>
    <span class="amt-col"><b class="amt">${money(e.amount, cur)}</b>${foreign ? `<small>${v === null ? "환율 없음" : "≈ " + money(v)}</small>` : ""}</span></div>`;
}

export function renderLedger() {
  const el = document.getElementById("pane-ledger"); if (!el) return;
  loadFx(baseCur());
  const setOpen = !!el.querySelector(".budget-set[open]");
  const t = totals(), budget = +state.budget || 0, cur = baseCur();
  const pct = budget ? Math.min(100, Math.round(t.sum / budget * 100)) : 0;
  const s = settle();
  const all = state.expenses || [];

  // 여행 중이면 하루 평균과 남은 날 하루 예산
  const today = tripDay(), daysSpent = today === null ? 0 : today + 1;
  const tripSum = spending().filter(e => e.day != null && e.day <= (today ?? -1)).reduce((a, e) => a + val(e), 0);
  const daysLeft = today === null ? 0 : state.days.length - today;
  const perDay = daysSpent ? tripSum / daysSpent : 0;

  const bars = Object.entries(EXP_CATS).filter(([k]) => t.byCat[k]).map(([k, c]) =>
    `<span style="flex:${t.byCat[k]};background:${c.color}" title="${c.label} ${money(t.byCat[k])}"></span>`).join("");
  const legend = Object.entries(EXP_CATS).filter(([k]) => t.byCat[k]).map(([k, c]) =>
    `<span class="lg"><i style="background:${c.color}"></i>${c.label} ${money(t.byCat[k])} <small>${Math.round(t.byCat[k] / t.sum * 100)}%</small></span>`).join("");

  // 필터
  const usedCats = Object.keys(EXP_CATS).filter(k => spending().some(e => (e.cat || "etc") === k));
  if (filt.cat !== "all" && !usedCats.includes(filt.cat)) filt.cat = "all";
  const people = [["all", "모두"], [ME, "나"], ...(PARTNER ? [[PARTNER, nameOf(PARTNER)]] : []), ["both", "같이"]];
  if (!people.some(([v]) => v === filt.who)) filt.who = "all";
  const shown = all.filter(e => isSettle(e)
    ? filt.cat === "all" && filt.who === "all"
    : (filt.cat === "all" || (e.cat || "etc") === filt.cat) && (filt.who === "all" || e.paidBy === filt.who));
  const filtered = filt.cat !== "all" || filt.who !== "all";
  const shownSum = shown.filter(e => !isSettle(e)).reduce((a, e) => a + val(e), 0);

  // 날짜별 묶음 (최근 날짜가 위, 여행 전 지출은 맨 아래)
  const groups = new Map();
  [...shown].sort((a, b) => (b.day ?? -1) - (a.day ?? -1) || (b.at || 0) - (a.at || 0)).forEach(e => {
    const k = e.day != null && state.days[e.day] ? e.day : "none";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(e);
  });
  const list = [...groups].map(([k, items]) => {
    const sub = items.filter(e => !isSettle(e)).reduce((a, e) => a + val(e), 0);
    return `<div class="exp-day ${k !== "none" && k === today ? "is-today" : ""}">
      <div class="exp-day-h"><b>${esc(dateLabel(k === "none" ? null : k))}</b>${k !== "none" && k === today ? `<span class="pill">오늘</span>` : ""}<span class="sub">${money(sub)}</span></div>
      ${items.map(rowHtml).join("")}</div>`;
  }).join("");

  el.innerHTML = `
    <section class="card">
      <div class="card-h">${icon("wallet", 18)}<b>우리 가계부</b><span class="muted">${esc(CITY.name)}</span>
        <button class="btn sm primary" data-act="addExp">${icon("plus", 15)}지출</button></div>
      <div class="budget">
        <div class="budget-n"><b>${money(t.sum)}</b><span>${budget ? `/ ${money(budget)}` : "썼어요"}</span></div>
        ${budget ? `<div class="budget-left ${t.sum > budget ? "over" : ""}">${t.sum > budget ? `${money(t.sum - budget)} 초과` : `${money(budget - t.sum)} 남음`}</div>` : ""}
      </div>
      ${t.sum > 0 && won(t.sum) ? `<p class="hint">${won(t.sum)} <small class="fx-src">${state.fx > 0 ? `직접 넣은 환율 1 ${cur} = ${fmtRate(state.fx)}원` : `오늘 환율 1 ${cur} = ${fmtRate(autoFx(cur))}원`}</small></p>` : ""}
      ${t.unconverted ? `<p class="hint warn">원화로 적은 지출 ${t.unconverted}건은 환율을 불러오면 합계에 들어가요.</p>` : ""}
      ${budget ? `<div class="meter" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>` : ""}
      ${daysSpent ? `<div class="ledger-stats">
          <div><b>${money(perDay)}</b><span>하루 평균</span></div>
          ${budget && daysLeft > 0 ? `<div><b class="${budget - t.sum < 0 ? "over" : ""}">${money(Math.max(0, budget - t.sum) / daysLeft)}</b><span>남은 ${daysLeft}일 하루 예산</span></div>` : ""}
          ${t.cash ? `<div><b>${money(t.cash)}</b><span>현금으로 쓴 돈</span></div>` : ""}
        </div>` : ""}
      ${bars ? `<div class="stack">${bars}</div><div class="legend">${legend}</div>` : ""}
      ${PARTNER ? `<div class="settle">${icon("users", 16)} ${settleText(s)}
        <small>낸 돈: 나 ${money(t.mine)} · ${esc(nameOf(PARTNER))} ${money(t.theirs)}${t.shared ? ` · 공동 ${money(t.shared)}` : ""}</small>
        ${s ? `<button class="btn sm" data-act="settleDone">${icon("check", 15)}정산 완료로 기록</button>` : ""}</div>`
        : `<p class="hint">짝꿍을 연결하면 누가 얼마 냈는지 보고 반반 정산해 드려요.</p>`}
      <details class="budget-set" ${setOpen ? "open" : ""}><summary>예산·통화 설정</summary>
        <div class="row">
          <label class="field inline"><span>총예산</span><input type="number" min="0" step="1" data-prep="budget" value="${budget || ""}" placeholder="0"></label>
          <label class="field inline"><span>통화</span><select data-prep="currency">${Object.entries(CURRENCIES).map(([k, v]) => `<option value="${k}" ${k === cur ? "selected" : ""}>${k} ${v}</option>`).join("")}</select></label>
          ${cur !== "KRW" ? `<label class="field inline"><span>1 ${cur} =</span><input type="number" min="0" step="any" data-prep="fx" value="${state.fx || ""}" placeholder="${autoFx(cur) ? fmtRate(autoFx(cur)) : "자동"}"> 원</label>` : ""}
        </div>
        ${cur !== "KRW" ? `<p class="hint">${autoFx(cur) ? `비워두면 오늘 환율(${fxCache[cur].date ? esc(fxCache[cur].date) + " 기준" : "자동"})을 써요. 환전한 환율로 계산하고 싶으면 직접 넣어 주세요.` : "비워두면 오늘 환율을 자동으로 불러와요."} <a href="https://www.exchangerate-api.com" target="_blank" rel="noopener">환율 출처</a></p>` : ""}
      </details>
    </section>
    <section class="card">
      <div class="card-h">${icon("receipt", 18)}<b>지출 내역</b><span class="muted">${spending().length ? `${spending().length}건` : ""}</span>
        ${all.length ? `<button class="btn sm" data-act="expCsv">${icon("download", 15)}CSV</button>` : ""}</div>
      ${spending().length ? `<div class="chips exp-filter" role="group" aria-label="분류">
          <button class="chip ${filt.cat === "all" ? "list-on" : ""}" data-fcat="all">전체</button>
          ${usedCats.map(k => `<button class="chip ${filt.cat === k ? "list-on" : ""}" data-fcat="${k}" style="--c:${EXP_CATS[k].color}">${icon(EXP_CATS[k].icon, 14)}${EXP_CATS[k].label}</button>`).join("")}
        </div>
        <div class="seg who-filter" role="group" aria-label="누가 냈는지" style="grid-template-columns:repeat(${people.length},minmax(0,1fr))">
          ${people.map(([v, l]) => `<button class="${filt.who === v ? "on" : ""}" data-fwho="${esc(v)}">${esc(l)}</button>`).join("")}
        </div>
        ${filtered ? `<p class="hint filter-sum">고른 지출 합계 <b>${money(shownSum)}</b></p>` : ""}` : ""}
      <div class="exp-list">${list || (all.length ? `<p class="muted">조건에 맞는 지출이 없어요.</p>`
        : `<div class="empty-big small">${icon("wallet", 32)}<span>항공·숙소처럼 미리 낸 돈부터 적어 보세요. 원화로 낸 돈도 그대로 적으면 환율로 바꿔 더해요.</span>
          <button class="btn primary" data-act="addExp">${icon("plus", 16)}첫 지출 기록</button></div>`)}</div>
    </section>`;
}

/* ---------- 준비 탭에 보이는 요약 ---------- */
export function ledgerMiniHtml() {
  const t = totals(), budget = +state.budget || 0, s = settle();
  return `<section class="card ledger-mini">
      <div class="card-h">${icon("wallet", 18)}<b>가계부</b>
        <button class="btn sm primary" data-act="addExp">${icon("plus", 15)}지출</button></div>
      <div class="budget">
        <div class="budget-n"><b>${money(t.sum)}</b><span>${budget ? `/ ${money(budget)}` : "썼어요"}</span></div>
        ${budget ? `<div class="budget-left ${t.sum > budget ? "over" : ""}">${t.sum > budget ? `${money(t.sum - budget)} 초과` : `${money(budget - t.sum)} 남음`}</div>` : ""}
      </div>
      ${PARTNER ? `<div class="settle">${icon("users", 16)} ${settleText(s)}</div>` : ""}
      <button class="btn block" data-act="openLedger">가계부 열기 ${spending().length ? `· ${spending().length}건` : ""}</button>
    </section>`;
}

/* ---------- CSV ---------- */
export function ledgerCsv() {
  const q = v => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ["날짜", "Day", "분류", "내용", "금액", "통화", `${baseCur()} 환산`, "원화 환산", "낸 사람", "누구 몫", "결제"];
  const rows = [...(state.expenses || [])].sort((a, b) => (a.day ?? -1) - (b.day ?? -1) || (a.at || 0) - (b.at || 0)).map(e => {
    const v = inBase(e), krw = (e.cur || baseCur()) === "KRW" ? +e.amount : v !== null && fxRate() > 0 ? Math.round(v * fxRate()) : "";
    const day = e.day != null && state.days[e.day] ? e.day : null;
    return [day === null ? "" : dateOfDay(day) || "", day === null ? "" : day + 1,
      isSettle(e) ? "정산" : (EXP_CATS[e.cat] || EXP_CATS.etc).label,
      isSettle(e) ? `${nameOf(e.paidBy)} → ${nameOf(e.to)}` : e.title || "",
      e.amount, e.cur || baseCur(), v === null ? "" : Math.round(v * 100) / 100, krw,
      nameOf(e.paidBy) || "", isSettle(e) ? "" : e.for && e.for !== "both" ? nameOf(e.for) : "같이", PAY[e.pay] || ""];
  });
  return "﻿" + [head, ...rows].map(r => r.map(q).join(",")).join("\n");
}
function downloadCsv() {
  const blob = new Blob([ledgerCsv()], { type: "text/csv;charset=utf-8" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: `duriseo-ledger-${CITY.id}-${todayStr()}.csv` });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ---------- 지출 입력 창 ---------- */
const segHtml = (name, opts, checked) => opts.map(([v, l]) =>
  `<label class="seg-opt"><input type="radio" name="${name}" value="${esc(v)}" ${v === checked ? "checked" : ""}><span>${esc(l)}</span></label>`).join("");
export function openExp(id, preset = {}) {
  const dlg = document.getElementById("expDlg"), f = document.getElementById("expForm");
  const e = id ? (state.expenses || []).find(x => x.id === id) : null;
  if (e && isSettle(e)) {   // 정산 기록은 고칠 게 없어서 지우기만
    if (confirm(`정산 기록(${nameOf(e.paidBy)} → ${nameOf(e.to)} ${money(e.amount)})을 지울까요?`)) {
      state.expenses = state.expenses.filter(x => x.id !== e.id); changed();
    }
    return;
  }
  f.reset();
  dlg.dataset.id = e ? e.id : "";
  document.getElementById("expDlgTitle").textContent = e ? "지출 고치기" : "지출 기록";
  document.getElementById("expDel").hidden = !e;
  f.cat.innerHTML = Object.entries(EXP_CATS).map(([k, c]) => `<option value="${k}">${c.label}</option>`).join("");
  f.day.innerHTML = `<option value="">여행 전·날짜 없음</option>` + state.days.map((_, i) => `<option value="${i}">${esc(dayLabel(i))}</option>`).join("");
  const v = Object.assign({ cat: "food", day: tripDay(), paidBy: ME, for: "both", pay: "card", cur: baseCur() }, preset, e || {});
  const curs = baseCur() === "KRW" ? [["KRW", "원"]] : [[baseCur(), `${baseCur()} 현지 돈`], ["KRW", "원화"]];
  f.querySelector(".cur").innerHTML = segHtml("cur", curs, v.cur || baseCur());
  f.querySelectorAll(".cur, .cur-l").forEach(x => { x.hidden = curs.length < 2; });
  f.querySelector(".paid").innerHTML = segHtml("paidBy", [[ME, "나"], ...(PARTNER ? [[PARTNER, nameOf(PARTNER)]] : []), ["both", "같이(공동)"]], v.paidBy);
  f.querySelector(".for").innerHTML = segHtml("for", [["both", "둘이 같이"], [ME, "나만"], ...(PARTNER ? [[PARTNER, `${nameOf(PARTNER)}만`]] : [])], v.for || "both");
  f.querySelectorAll(".for-l, .for").forEach(x => { x.hidden = !PARTNER; });
  f.querySelector(".pay").innerHTML = segHtml("pay", Object.entries(PAY), v.pay || "card");
  const syncCur = () => { document.getElementById("expCur").textContent = (f.querySelector("[name=cur]:checked") || {}).value || baseCur(); };
  f.querySelectorAll("[name=cur]").forEach(r => { r.onchange = syncCur; }); syncCur();
  f.title.value = v.title || ""; f.amount.value = v.amount ?? ""; f.cat.value = v.cat;
  f.day.value = v.day ?? "";
  if (!f.querySelector("[name=paidBy]:checked")) f.querySelector("[name=paidBy]").checked = true;
  dlg.showModal();
  f.amount.focus();   // showModal 직후 바로 (지연시키면 이미 입력 중인 칸에서 포커스를 빼앗음)
}
const pick = (f, n, d) => (f.querySelector(`[name=${n}]:checked`) || {}).value || d;
function submitExp() {
  const dlg = document.getElementById("expDlg"), f = document.getElementById("expForm");
  const amount = parseFloat(f.amount.value);
  if (!(amount > 0)) { f.amount.focus(); return toast("금액을 넣어 주세요"); }
  const cur = pick(f, "cur", baseCur());
  const data = { title: f.title.value.trim(), amount: Math.round(amount * 100) / 100, cat: f.cat.value,
    paidBy: pick(f, "paidBy", ME), for: PARTNER ? pick(f, "for", "both") : "both", pay: pick(f, "pay", "card"),
    day: f.day.value === "" ? null : +f.day.value };
  if (cur !== baseCur()) data.cur = cur;
  state.expenses = state.expenses || [];
  const e = state.expenses.find(x => x.id === dlg.dataset.id);
  if (e) { Object.assign(e, data); if (cur === baseCur()) delete e.cur; }
  else state.expenses.push({ id: uid("e"), at: Date.now(), ...data });
  dlg.close(); changed();
}
// 바뀐 뒤: 저장하고 가계부·준비 탭·오늘 카드를 다시 그림 (renderPrep이 가계부도 같이 그림)
function changed() { save(); renderPrep(); refreshToday(); }
let refreshToday = () => {};

export function bindLedger({ showTab, todayCard }) {
  refreshToday = () => { const el = document.getElementById("todayCard"); if (el) el.innerHTML = todayCard(); };
  const onClick = e => {
    const t = e.target.closest("[data-act],[data-exp],[data-fcat],[data-fwho]"); if (!t) return;
    if (t.dataset.act === "addExp") return openExp(null);
    if (t.dataset.act === "openLedger") return showTab("ledger");
    if (t.dataset.act === "expCsv") return downloadCsv();
    if (t.dataset.act === "settleDone") {
      const s = settle(); if (!s) return;
      if (!confirm(`${nameOf(s.from)} → ${nameOf(s.to)} ${money(s.amount)} 보낸 걸로 기록할까요?`)) return;
      state.expenses = (state.expenses || []).concat({ id: uid("s"), kind: "settle", amount: Math.round(s.amount * 100) / 100,
        paidBy: s.from, to: s.to, day: tripDay(), at: Date.now() });
      changed(); return toast("정산 완료! 이제 반반이 맞아요");
    }
    if (t.dataset.fcat) { filt.cat = t.dataset.fcat; return renderLedger(); }
    if (t.dataset.fwho) { filt.who = t.dataset.fwho; return renderLedger(); }
    if (t.dataset.exp) return openExp(t.dataset.exp);
  };
  document.getElementById("pane-ledger").addEventListener("click", onClick);
  document.getElementById("pane-prep").addEventListener("click", e => {
    if (e.target.closest('.ledger-mini [data-act="addExp"], [data-act="openLedger"]')) onClick(e);
  });
  // 예산·통화·환율 설정
  document.getElementById("pane-ledger").addEventListener("change", e => {
    const k = e.target.dataset.prep; if (!k) return;
    const v = e.target.value;
    if (k === "currency") state.currency = v;
    else state[k] = Math.max(0, parseFloat(v) || 0);
    save(); renderPrep();
  });
  document.getElementById("days").parentElement.addEventListener("click", e => {
    if (e.target.closest('[data-act="addExpToday"]')) openExp(null, { day: tripDay() });
  });
  const dlg = document.getElementById("expDlg");
  document.getElementById("expForm").addEventListener("submit", e => { e.preventDefault(); submitExp(); });
  document.getElementById("expCancel").onclick = () => dlg.close();
  document.getElementById("expDel").onclick = () => {
    state.expenses = (state.expenses || []).filter(x => x.id !== dlg.dataset.id);
    dlg.close(); changed();
  };
}
