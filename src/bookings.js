import { toast } from "./actions.js";
import { icon } from "./icons.js";
import { ME, nameOf } from "./pick.js";
import { app, esc, save, state } from "./store.js";
import { hasTrip, tripCities } from "./trip.js";

// 예약 정보 모음: 항공·숙소·투어 등 예약번호·시간·바우처 링크를 한곳에. 날짜가 맞는 일정 카드와 오늘 카드에도 보여줌

export const BOOK_TYPES = {
  flight: { label: "항공",      icon: "plane",  color: "#1c7ed6", start: "출발", end: "도착",     title: "예: 대한항공 KE401 인천 → 시드니" },
  stay:   { label: "숙소",      icon: "bed",    color: "#7048e8", start: "체크인", end: "체크아웃", title: "예: 서리힐스 로프트 (에어비앤비)" },
  tour:   { label: "투어·공연", icon: "ticket", color: "#e8590c", start: "시작", end: "끝",       title: "예: 오페라 하우스 공연 2석" },
  move:   { label: "교통",      icon: "bus",    color: "#0b7285", start: "출발", end: "도착",     title: "예: 공항 픽업, 렌터카, 페리" },
  food:   { label: "식당",      icon: "utensils", color: "#c2255c", start: "예약", end: "",       title: "예: 베넬롱 디너 2인" },
  etc:    { label: "기타",      icon: "receipt", color: "#868e96", start: "날짜", end: "끝",      title: "예: 웨딩 스냅 촬영" },
};
const uid = () => "b" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const md = s => { if (!s) return ""; const [, m, d] = s.split("-"); const wd = "일월화수목금토"[new Date(s + "T00:00:00").getDay()]; return `${+m}/${+d}(${wd})`; };
const when = (date, time) => [md(date), time].filter(Boolean).join(" ");

// 여러 도시 일정이면 일정표에 있는 모든 도시의 예약을 함께 봄 (시드니에서 넣은 케언즈행 항공편이 케언즈 날에도 보이게)
const bookingPlans = () => {
  const plans = hasTrip() ? tripCities().map(c => app.plans[c]).filter(Boolean) : [];
  return plans.includes(state) ? plans : [state, ...plans];
};
const findBooking = id => { for (const plan of bookingPlans()) { const b = (plan.bookings || []).find(x => x.id === id); if (b) return { b, plan }; } return null; };
const sorted = () => bookingPlans().flatMap(p => p.bookings || []).sort((a, b) =>
  (a.date || "9999").localeCompare(b.date || "9999") || (a.time || "").localeCompare(b.time || "") || (a.at || 0) - (b.at || 0));

// 그날 일어나는 예약 (숙소는 체크인·체크아웃 날 모두)
export function bookingsOn(date) {
  if (!date) return [];
  const out = [];
  for (const b of sorted()) {
    if (b.date === date) out.push({ b, time: b.time, what: BOOK_TYPES[b.type]?.start || "" });
    else if (b.endDate === date && BOOK_TYPES[b.type]?.end) out.push({ b, time: b.endTime, what: BOOK_TYPES[b.type].end });
  }
  return out.sort((x, y) => (x.time || "").localeCompare(y.time || ""));
}
// 일정 카드·오늘 카드에 넣는 작은 줄
export function bookingChips(date) {
  const list = bookingsOn(date);
  if (!list.length) return "";
  return `<div class="bk-chips">${list.map(({ b, time, what }) => {
    const t = BOOK_TYPES[b.type] || BOOK_TYPES.etc;
    return `<button class="bk-chip" data-book="${esc(b.id)}" style="--c:${t.color}">${icon(t.icon, 15)}
      <span>${time ? `<b>${esc(time)}</b> ` : ""}${esc(what)} · ${esc(b.title || t.label)}</span>${b.code ? `<code>${esc(b.code)}</code>` : ""}</button>`;
  }).join("")}</div>`;
}

export function bookingsCardHtml() {
  const list = sorted();
  const rows = list.map(b => {
    const t = BOOK_TYPES[b.type] || BOOK_TYPES.etc;
    const span = [when(b.date, b.time), b.endDate || b.endTime ? when(b.endDate, b.endTime) : ""].filter(Boolean).join(" → ");
    return `<div class="bk" style="--c:${t.color}">
      <span class="cat-ico">${icon(t.icon, 18)}</span>
      <div class="txt" data-book="${esc(b.id)}"><b>${esc(b.title || t.label)}</b><span>${esc(span || "날짜 미정")}${b.by && b.by !== ME ? ` · ${esc(nameOf(b.by))}` : ""}</span></div>
      ${b.code ? `<button class="bk-code" data-copy="${esc(b.code)}" title="예약번호 복사">${esc(b.code)}${icon("copy", 13)}</button>` : ""}
      ${b.link ? `<a class="btn icon" href="${esc(b.link)}" target="_blank" rel="noopener" aria-label="예약 확인 열기">${icon("external", 15)}</a>` : ""}
    </div>`;
  }).join("");
  return `<section class="card" id="bookCard">
    <div class="card-h">${icon("ticket", 18)}<b>예약 정보</b>
      <button class="btn sm primary" data-act="addBook">${icon("plus", 15)}예약</button></div>
    ${rows || `<p class="muted">항공권·숙소·투어 예약번호와 확인 메일 링크를 모아 두면, 여행 중에 그날 일정에서 바로 꺼내 볼 수 있어요.</p>`}
  </section>`;
}

/* ---------- 입력 창 ---------- */
let afterChange = () => {};
export function openBooking(id, preset = {}) {
  const dlg = document.getElementById("bookDlg"), f = document.getElementById("bookForm");
  const b = id ? (findBooking(id) || {}).b : null;
  f.reset();
  dlg.dataset.id = b ? b.id : "";
  document.getElementById("bookDlgTitle").textContent = b ? "예약 고치기" : "예약 추가";
  document.getElementById("bookDel").hidden = !b;
  f.querySelector(".types").innerHTML = Object.entries(BOOK_TYPES).map(([k, t]) =>
    `<label class="type-opt" style="--c:${t.color}"><input type="radio" name="type" value="${k}"><span>${icon(t.icon, 18)}${t.label}</span></label>`).join("");
  const v = Object.assign({ type: "flight" }, preset, b || {});
  for (const k of ["title", "date", "time", "endDate", "endTime", "code", "link", "note"]) f[k].value = v[k] || "";
  f.querySelector(`[name=type][value="${v.type}"]`).checked = true;
  labels(v.type);
  dlg.showModal();
}
function labels(type) {
  const t = BOOK_TYPES[type] || BOOK_TYPES.etc, f = document.getElementById("bookForm");
  document.getElementById("bkStart").textContent = t.start;
  document.getElementById("bkEnd").textContent = t.end;
  document.getElementById("bkEndRow").hidden = !t.end;
  f.title.placeholder = t.title;
}
function submit() {
  const dlg = document.getElementById("bookDlg"), f = document.getElementById("bookForm");
  const type = (f.querySelector("[name=type]:checked") || {}).value || "etc";
  const data = { type };
  for (const k of ["title", "date", "time", "endDate", "endTime", "code", "link", "note"]) data[k] = f[k].value.trim();
  if (!BOOK_TYPES[type].end) { data.endDate = ""; data.endTime = ""; }
  if (!data.title && !data.code) { f.title.focus(); return toast("이름이나 예약번호를 넣어 주세요"); }
  if (data.link && !/^https?:\/\//i.test(data.link)) data.link = "https://" + data.link;
  const found = findBooking(dlg.dataset.id);
  if (found) Object.assign(found.b, data);
  else (state.bookings = state.bookings || []).push({ id: uid(), at: Date.now(), by: ME, ...data });
  save(); dlg.close(); afterChange();
}

export function bindBookings(onChange) {
  afterChange = onChange;
  const dlg = document.getElementById("bookDlg"), f = document.getElementById("bookForm");
  f.addEventListener("change", e => {
    if (e.target.name === "type") labels(e.target.value);
    // 시작 날짜를 정하면 끝 날짜 기본값도 맞춰 줌
    if (e.target.name === "date" && !f.endDate.value && e.target.value) {
      const stay = (f.querySelector("[name=type]:checked") || {}).value === "stay";
      const d = new Date(e.target.value + "T00:00:00"); if (stay) d.setDate(d.getDate() + 1);   // 숙소는 다음 날 체크아웃
      f.endDate.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
  });
  f.addEventListener("submit", e => { e.preventDefault(); submit(); });
  document.getElementById("bookCancel").onclick = () => dlg.close();
  document.getElementById("bookDel").onclick = () => {
    if (!confirm("이 예약 정보를 지울까요?")) return;
    const found = findBooking(dlg.dataset.id);
    if (found) found.plan.bookings = found.plan.bookings.filter(x => x.id !== dlg.dataset.id);
    save(); dlg.close(); afterChange();
  };
  // 어디서든(준비 탭·일정 카드·오늘 카드) 예약 칩을 누르면 열림, 예약번호는 눌러서 복사
  document.addEventListener("click", async e => {
    const c = e.target.closest("[data-copy]");
    if (c) { e.stopPropagation(); await navigator.clipboard.writeText(c.dataset.copy).catch(() => {}); return toast(`예약번호 ${c.dataset.copy} 복사했어요`); }
    const add = e.target.closest('[data-act="addBook"]');
    if (add) return openBooking(null);
    const b = e.target.closest("[data-book]");
    if (b && !e.target.closest("a")) openBooking(b.dataset.book);
  });
}
