import { addToDay, toast } from "./actions.js";
import { CATS } from "./data.js";
import { gcache, photoUrl } from "./google.js";
import { icon } from "./icons.js";
import { buildMarkers, dayLabel, filter, matches, openPlace } from "./render.js";
import { allPlaces, app, byId, esc, save, state, tempPlaces } from "./store.js";

// 함께 고르기: 각자 장소에 좋아요(1)/패스(-1)를 남기고, 둘 다 좋아요한 곳(매치)을 일정에 먼저 넣도록 도움

/* ---------- 누가 고르는지 ---------- */
// 로그인 전에는 "me". 로그인하면 계정 uid로 바뀌고, 그 전에 남긴 표시는 uid로 옮김
const VOTER_KEY = "voter-id";
let stored = null;
try { stored = localStorage.getItem(VOTER_KEY); } catch (e) {}
export let ME = stored || "me";
export let PARTNER = null;

export let NAMES = {};   // { uid: 이름 } — 지출·체크리스트에 누가 했는지 보여줄 때
export const nameOf = id => id === ME ? "나" : id === PARTNER ? (NAMES[id] || "짝꿍") : id === "both" ? "같이" : "";
export function setPeople(me, partner, names) {
  if (names) NAMES = names;
  if (me && me !== ME) {
    const old = ME;
    for (const plan of Object.values(app.plans)) {
      for (const v of Object.values(plan.votes || {})) {
        if (old in v && !(me in v)) v[me] = v[old];
        if (old === "me") delete v[old];
      }
      // 로그인 전에 기록한 지출·체크도 내 계정으로
      for (const e of plan.expenses || []) if (e.paidBy === old) e.paidBy = me;
      for (const c of plan.checklist || []) if (c.doneBy === old) c.doneBy = me;
      for (const b of plan.bookings || []) if (b.by === old) b.by = me;
    }
    ME = me;
    try { localStorage.setItem(VOTER_KEY, me); } catch (e) {}
    save();
  }
  if (partner !== undefined && partner !== PARTNER) { PARTNER = partner; refreshPick(); }
}

/* ---------- 표시 읽기·쓰기 ---------- */
const votesOf = id => (state.votes || {})[id] || {};
export const myVote = id => votesOf(id)[ME] || 0;
export const partnerVote = id => (PARTNER ? votesOf(id)[PARTNER] || 0 : 0);
export const isMatch = id => myVote(id) === 1 && partnerVote(id) === 1;
export const matchIds = () => Object.keys(state.votes || {}).filter(id => isMatch(id) && byId(id));
const pickable = p => p && p.cat !== "stay" && p.cat !== "trans" && !tempPlaces[p.id];

export function vote(id, v) {
  const wasMatch = isMatch(id);
  state.votes = state.votes || {};
  const entry = state.votes[id] = { ...(state.votes[id] || {}) };
  if (v) entry[ME] = v; else delete entry[ME];
  if (!Object.keys(entry).length) delete state.votes[id];
  save();
  refreshPick();
  buildMarkers();
  if (!wasMatch && isMatch(id)) celebrate(id);
}
export function toggleLike(id) { vote(id, myVote(id) === 1 ? 0 : 1); }
window.toggleLike = id => { toggleLike(id); openPlace(id, false); };

/* ---------- 매치 축하 + 날짜 고르기 ---------- */
export function chooseDay(id, title) {
  const p = byId(id); if (!p) return;
  const dlg = document.getElementById("dayDlg");
  document.getElementById("dayDlgTitle").innerHTML = title || `${esc(p.name)}`;
  document.getElementById("dayDlgBody").innerHTML = state.days.map((d, i) => {
    const has = d.stops.includes(id);
    return `<button class="day-opt ${has ? "on" : ""}" data-day="${i}" ${has ? "disabled" : ""}>
      <b>${esc(dayLabel(i))}</b><span>${has ? "이미 있어요" : `${d.stops.length}곳`}</span></button>`;
  }).join("");
  dlg.dataset.id = id;
  dlg.showModal();
}
function celebrate(id) {
  const p = byId(id);
  const day = state.days.findIndex(d => d.stops.includes(id));
  if (day >= 0) return toast(`둘 다 좋아요! ${p.name}은(는) 이미 ${dayLabel(day)} 일정에 있어요`);
  chooseDay(id, `<span class="love">${icon("heart", 22, 'fill="currentColor"')}</span> 둘 다 좋아요!<small>${esc(p.name)} — 며칠째에 갈까요?</small>`);
}

/* ---------- 카드 덱 ---------- */
// 짝꿍이 좋아요한 곳을 먼저, 나머지는 카테고리를 섞어서
function deck() {
  const left = allPlaces().filter(p => pickable(p) && myVote(p.id) === 0);
  const byCat = {};
  left.forEach(p => (byCat[p.cat] = byCat[p.cat] || []).push(p));
  const mixed = [], lists = Object.values(byCat);
  for (let i = 0; lists.some(l => i < l.length); i++) lists.forEach(l => { if (l[i]) mixed.push(l[i]); });
  return mixed.sort((a, b) => (partnerVote(b.id) === 1) - (partnerVote(a.id) === 1));
}
export const partnerWaiting = () => allPlaces().filter(p => pickable(p) && partnerVote(p.id) === 1 && myVote(p.id) === 0).length;

function cardHtml(p, back) {
  const c = CATS[p.cat] || CATS.mine, photo = (gcache.det[p.id] || {}).photo;
  return `<article class="pcard ${back ? "back" : ""}" data-id="${p.id}" style="--c:${c.color}">
    <div class="pcard-hero">${photo && !back ? `<img src="${photoUrl(photo)}" alt="" onerror="this.remove()">` : ""}
      <span class="pcard-icon">${icon(c.icon, 44)}</span>
      ${partnerVote(p.id) === 1 ? `<span class="pcard-partner">${icon("heart", 14, 'fill="currentColor"')} 짝꿍이 좋아요</span>` : ""}
    </div>
    <div class="pcard-body">
      <span class="pcard-cat">${esc(c.label)}${p.area ? " · " + esc(p.area) : ""}</span>
      <h3>${esc(p.name)}</h3>
      ${p.desc ? `<p>${esc(p.desc)}</p>` : ""}
      ${p.tip ? `<p class="pcard-tip">${icon("sparkles", 14)} ${esc(p.tip)}</p>` : ""}
    </div>
  </article>`;
}

let view = "deck";
export function renderPick() {
  const deckEl = document.getElementById("pickDeck"), listEl = document.getElementById("pickMatches");
  if (!deckEl) return;
  const matches = matchIds();
  document.getElementById("matchCount").textContent = matches.length || "";
  document.querySelectorAll("#pickSeg [data-pick]").forEach(b => b.classList.toggle("on", b.dataset.pick === view));
  deckEl.hidden = view !== "deck"; listEl.hidden = view !== "matches";
  updateBadge();
  if (view === "deck") {
    const cards = deck();
    deckEl.innerHTML = cards.length ? `
      <div class="pdeck">${cards[1] ? cardHtml(cards[1], true) : ""}${cardHtml(cards[0])}</div>
      <p class="pick-left">${cards.length}곳 남음${PARTNER ? "" : " · 짝꿍을 연결하면 서로 고른 곳이 맞춰져요"}</p>
      <div class="pick-actions">
        <button class="pbtn pass" data-vote="-1" aria-label="패스">${icon("x", 28)}</button>
        <button class="pbtn like" data-vote="1" aria-label="좋아요">${icon("heart", 34, 'fill="currentColor"')}</button>
        <button class="pbtn add" data-vote="add" aria-label="일정에 바로 추가">${icon("calendarPlus", 26)}</button>
      </div>` : `
      <div class="empty-big">${icon("check", 40)}<b>다 골랐어요!</b>
        <span>${matches.length ? `둘 다 좋아한 곳이 ${matches.length}곳 있어요.` : PARTNER ? "짝꿍이 고르면 둘 다 좋아한 곳이 여기 모여요." : "짝꿍을 연결하면 둘 다 좋아한 곳을 찾아드려요."}</span>
        <button class="btn primary" data-pick="matches">고른 곳 보기</button></div>`;
    bindSwipe(deckEl.querySelector(".pcard:not(.back)"));
  } else {
    const row = (p, extra = "") => `<div class="mrow" data-id="${p.id}" style="--c:${(CATS[p.cat] || CATS.mine).color}">
      <span class="cat-ico">${icon((CATS[p.cat] || CATS.mine).icon, 18)}</span>
      <div class="mrow-txt" data-open="${p.id}"><b>${esc(p.name)}</b><span>${esc(p.area || (CATS[p.cat] || {}).label || "")}${extra}</span></div>
      <button class="btn sm" data-addday="${p.id}">${icon("calendarPlus", 16)} 일정</button></div>`;
    const inPlan = id => state.days.map((d, i) => d.stops.includes(id) ? `D${i + 1}` : null).filter(Boolean).join(" ");
    const mine = allPlaces().filter(p => pickable(p) && myVote(p.id) === 1 && !isMatch(p.id));
    const theirs = allPlaces().filter(p => pickable(p) && partnerVote(p.id) === 1 && myVote(p.id) === 0);
    listEl.innerHTML = `
      <h3 class="sec-h"><span class="love">${icon("heart", 16, 'fill="currentColor"')}</span> 둘 다 좋아요 <small>${matches.length}</small></h3>
      ${matches.length ? matches.map(byId).map(p => row(p, inPlan(p.id) ? ` · 일정 ${inPlan(p.id)}` : " · 아직 일정에 없어요")).join("")
        : `<p class="muted">${PARTNER ? "아직 겹치는 곳이 없어요. 고르기를 계속해 보세요." : "짝꿍을 연결하면 서로 좋아요한 곳이 여기 모여요."}</p>`}
      ${theirs.length ? `<h3 class="sec-h">짝꿍이 좋아요 · 내 차례 <small>${theirs.length}</small></h3>${theirs.map(p => row(p)).join("")}` : ""}
      ${mine.length ? `<h3 class="sec-h">내가 좋아요 <small>${mine.length}</small></h3>${mine.map(p => row(p)).join("")}` : ""}`;
  }
}
export function refreshPick() { renderPick(); filter(); renderSuggest(); }

function updateBadge() {
  const n = partnerWaiting(), b = document.getElementById("pickBadge");
  if (b) { b.textContent = n; b.hidden = !n; }
}

// 일정 탭 위쪽: 둘 다 좋아했는데 아직 일정에 없는 곳
export function renderSuggest() {
  const el = document.getElementById("planSuggest"); if (!el) return;
  const planned = new Set(state.days.flatMap(d => d.stops));
  const ids = matchIds().filter(id => !planned.has(id));
  el.hidden = !ids.length;
  el.innerHTML = ids.length ? `<div class="suggest-h"><span class="love">${icon("heart", 15, 'fill="currentColor"')}</span> 둘 다 좋아했는데 아직 일정에 없어요</div>
    <div class="suggest-chips">${ids.map(id => `<button class="chip" data-addday="${id}">${icon("plus", 14)} ${esc(byId(id).name)}</button>`).join("")}</div>` : "";
}

/* ---------- 넘기기(스와이프) ---------- */
function decide(v) {
  const top = document.querySelector("#pickDeck .pcard:not(.back)"); if (!top) return;
  const id = top.dataset.id;
  if (v === "add") return chooseDay(id);
  top.classList.add(v === 1 ? "fly-right" : "fly-left");
  setTimeout(() => {
    vote(id, v);
    if (v === 1 && !isMatch(id)) toast(`${byId(id).name} 좋아요`);
  }, 180);
}
function bindSwipe(card) {
  if (!card) return;
  let x0 = null, dx = 0;
  card.addEventListener("pointerdown", e => { x0 = e.clientX; dx = 0; card.setPointerCapture(e.pointerId); card.classList.add("dragging"); });
  card.addEventListener("pointermove", e => {
    if (x0 === null) return;
    dx = e.clientX - x0;
    card.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
    card.dataset.hint = dx > 40 ? "like" : dx < -40 ? "pass" : "";
  });
  const end = () => {
    if (x0 === null) return;
    x0 = null; card.classList.remove("dragging");
    if (Math.abs(dx) > 90) decide(dx > 0 ? 1 : -1);
    else { card.style.transform = ""; card.dataset.hint = ""; }
  };
  card.addEventListener("pointerup", end);
  card.addEventListener("pointercancel", end);
}

export function bindPick() {
  const pane = document.getElementById("pane-pick");
  pane.addEventListener("click", e => {
    const t = e.target.closest("[data-pick],[data-vote],[data-addday],[data-open]"); if (!t) return;
    if (t.dataset.pick) { view = t.dataset.pick; return renderPick(); }
    if (t.dataset.vote) return decide(t.dataset.vote === "add" ? "add" : +t.dataset.vote);
    if (t.dataset.addday) return chooseDay(t.dataset.addday);
    if (t.dataset.open) return openPlace(t.dataset.open);
  });
  document.getElementById("planSuggest").addEventListener("click", e => {
    const t = e.target.closest("[data-addday]"); if (t) chooseDay(t.dataset.addday);
  });
  const dlg = document.getElementById("dayDlg");
  dlg.addEventListener("click", e => {
    if (e.target === dlg || e.target.closest("[data-close]")) return dlg.close();
    const b = e.target.closest("[data-day]"); if (!b) return;
    const id = dlg.dataset.id;
    dlg.close();
    if (myVote(id) !== 1 && pickable(byId(id))) vote(id, 1);   // 일정에 넣는 곳은 좋아요로도 남김
    addToDay(id, +b.dataset.day);
    renderSuggest();
  });
  // 키보드: ← 패스, → 좋아요 (고르기 화면에서만)
  document.addEventListener("keydown", e => {
    if (!pane.classList.contains("on") || view !== "deck" || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if (e.key === "ArrowRight") decide(1);
    if (e.key === "ArrowLeft") decide(-1);
  });
}
