import { dateOfDay } from "./bookings.js";
import { icon } from "./icons.js";
import { ME, PARTNER, nameOf } from "./pick.js";
import { money, todayStr, totals } from "./prep.js";
import { dayLabel } from "./render.js";
import { byId, esc, km, save, state } from "./store.js";

// 여행 일기: 날마다 둘이 각자 기분 + 한 줄, 다녀온 장소 별점, 그리고 "우리 여행 돌아보기"
// 저장: state.diary[날짜순번][사람] = { mood, text, at }, state.ratings[장소][사람] = 1~5 (둘이 동시에 써도 안 겹침)

export const MOODS = ["😍", "😊", "🙂", "😴", "😢"];
const entry = (i, who) => ((state.diary || {})[i] || {})[who] || null;
// 그날이 왔거나 지난 날에만 일기를 씀
export const dayStarted = i => { const d = dateOfDay(i); return !!d && d <= todayStr(); };
export const visited = id => state.days.some((d, i) => dayStarted(i) && d.stops.includes(id));
export const myRating = id => ((state.ratings || {})[id] || {})[ME] || 0;
export const partnerRating = id => PARTNER ? ((state.ratings || {})[id] || {})[PARTNER] || 0 : 0;

export function diaryHtml(i) {
  if (!dayStarted(i)) return "";
  const mine = entry(i, ME) || {}, theirs = PARTNER ? entry(i, PARTNER) : null;
  return `<div class="diary" data-dday="${i}">
    <div class="diary-h">${icon("pencil", 15)} 오늘의 한 줄</div>
    <div class="diary-row">
      <div class="moods" role="radiogroup" aria-label="오늘 기분">${MOODS.map(m => `<button class="mood ${mine.mood === m ? "on" : ""}" data-mood="${i}|${m}" role="radio" aria-checked="${mine.mood === m}" aria-label="기분 ${m}">${m}</button>`).join("")}</div>
      <input type="text" data-diary="${i}" maxlength="140" value="${esc(mine.text || "")}" placeholder="오늘 가장 좋았던 순간은?" aria-label="오늘의 한 줄">
    </div>
    ${theirs && (theirs.text || theirs.mood) ? `<p class="diary-partner"><b>${esc(nameOf(PARTNER))}</b> ${esc(theirs.mood || "")} ${esc(theirs.text || "")}</p>` : PARTNER ? `<p class="diary-partner muted">${esc(nameOf(PARTNER))}의 한 줄을 기다리는 중</p>` : ""}
  </div>`;
}

export function ratingHtml(id) {
  if (!visited(id)) return "";
  const r = myRating(id), pr = partnerRating(id);
  return `<div class="rate"><span class="muted">다녀왔어요 · 내 별점</span>
    <span class="stars" role="radiogroup" aria-label="별점">${[1, 2, 3, 4, 5].map(n => `<button class="star ${n <= r ? "on" : ""}" data-rate="${esc(id)}|${n}" role="radio" aria-checked="${n === r}" aria-label="${n}점">★</button>`).join("")}</span>
    ${pr ? `<span class="muted">· ${esc(nameOf(PARTNER))} ${"★".repeat(pr)}</span>` : ""}</div>`;
}

function setEntry(i, patch) {
  state.diary = state.diary || {};
  const box = { ...(state.diary[i] || {}) };
  const next = { ...(box[ME] || {}), ...patch, at: Date.now() };
  if (!next.text && !next.mood) delete box[ME]; else box[ME] = next;
  state.diary = { ...state.diary, [i]: box };
  save();
}
function setRating(id, n) {
  state.ratings = state.ratings || {};
  const box = { ...(state.ratings[id] || {}) };
  if (box[ME] === n) delete box[ME]; else box[ME] = n;   // 같은 별을 다시 누르면 취소
  state.ratings = { ...state.ratings, [id]: box };
  save();
}

/* ---------- 우리 여행 돌아보기 ---------- */
export function recapHtml() {
  const started = state.days.map((_, i) => i).filter(dayStarted);
  if (!started.length) return "";
  const stops = started.flatMap(i => state.days[i].stops.map(byId).filter(Boolean));
  const dist = started.reduce((a, i) => { const p = state.days[i].stops.map(byId).filter(Boolean); return a + p.slice(1).reduce((s, q, k) => s + km(p[k], q), 0); }, 0);
  const scored = [...new Set(stops.map(p => p.id))].map(id => {
    const r = Object.values((state.ratings || {})[id] || {}); return { id, avg: r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0, n: r.length };
  }).filter(x => x.n).sort((a, b) => b.avg - a.avg || b.n - a.n).slice(0, 3);
  const days = started.map(i => {
    const mine = entry(i, ME), theirs = PARTNER ? entry(i, PARTNER) : null;
    if (!mine && !theirs) return "";
    return `<li><b>${esc(dayLabel(i))}</b>
      ${mine ? `<span>${esc(mine.mood || "")} ${esc(mine.text || "")} <small>— 나</small></span>` : ""}
      ${theirs ? `<span>${esc(theirs.mood || "")} ${esc(theirs.text || "")} <small>— ${esc(nameOf(PARTNER))}</small></span>` : ""}</li>`;
  }).join("");
  const ended = started.length === state.days.length && dateOfDay(state.days.length - 1) < todayStr();
  return `<section class="card recap">
    <div class="card-h">${icon("heart", 18, 'fill="currentColor"')}<b>${ended ? "우리 여행 돌아보기" : "지금까지 우리 여행"}</b></div>
    <div class="recap-stats">
      <div><b>${started.length}</b><span>일</span></div>
      <div><b>${new Set(stops.map(p => p.id)).size}</b><span>곳</span></div>
      <div><b>${dist.toFixed(dist >= 10 ? 0 : 1)}</b><span>km 이동 (직선)</span></div>
      <div><b>${money(totals().sum)}</b><span>함께 쓴 돈</span></div>
    </div>
    ${scored.length ? `<h4 class="ck-g">별점 높은 곳</h4><ol class="recap-top">${scored.map(x => `<li>${esc(byId(x.id).name)} <span class="stars-sm">${"★".repeat(Math.round(x.avg))}</span></li>`).join("")}</ol>` : ""}
    ${days ? `<h4 class="ck-g">날마다 한 줄</h4><ul class="recap-days">${days}</ul>` : `<p class="muted">일정 탭에서 날마다 기분과 한 줄을 남기면 여기 모여요.</p>`}
  </section>`;
}

export function bindDiary(onChange) {
  document.addEventListener("click", e => {
    const m = e.target.closest("[data-mood]");
    if (m) { const [i, mood] = m.dataset.mood.split("|"); setEntry(i, { mood: (entry(i, ME) || {}).mood === mood ? "" : mood }); return onChange("diary"); }
    const s = e.target.closest("[data-rate]");
    if (s) { const [id, n] = s.dataset.rate.split("|"); setRating(id, +n); return onChange("rating", id); }
  });
  // 글은 다 쓰고 나서(포커스가 빠지거나 Enter) 저장 → 쓰는 도중 다시 그려지지 않게
  document.addEventListener("change", e => {
    const t = e.target.closest("[data-diary]"); if (!t) return;
    setEntry(t.dataset.diary, { text: t.value.trim().slice(0, 140) }); onChange("diary");
  });
  document.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches("[data-diary]")) e.target.blur(); });
}
