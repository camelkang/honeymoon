import { icon } from "./icons.js";
import { ME, PARTNER, nameOf } from "./pick.js";
import { openPlace } from "./render.js";
import { esc, save, state } from "./store.js";

// 장소마다 둘만의 한마디: "여기 꼭 가자!", "예약 필요함" 같은 짧은 메모를 주고받음
// 저장: state.comments[장소][메모id] = { by, text, at } — 둘이 동시에 써도 서로 덮어쓰지 않음

const MAX = 200;
export const commentsOf = id => Object.entries((state.comments || {})[id] || {})
  .map(([cid, c]) => ({ cid, ...c })).sort((a, b) => (a.at || 0) - (b.at || 0));
export const commentCount = id => Object.keys((state.comments || {})[id] || {}).length;
export const lastPartnerComment = id => commentsOf(id).filter(c => PARTNER && c.by === PARTNER).pop();

function ago(at) {
  const s = (Date.now() - at) / 1000;
  if (s < 60) return "방금";
  if (s < 3600) return `${Math.floor(s / 60)}분 전`;
  if (s < 86400) return `${Math.floor(s / 3600)}시간 전`;
  const d = new Date(at); return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function commentsHtml(id) {
  const list = commentsOf(id);
  return `<div class="cm" data-cmbox="${esc(id)}">
    ${list.length ? `<div class="cm-list">${list.map(c => {
      const mine = c.by === ME;
      return `<div class="cm-msg ${mine ? "mine" : ""}"><p>${esc(c.text)}</p>
        <small>${esc(mine ? "나" : nameOf(c.by) || "짝꿍")} · ${ago(c.at || Date.now())}${mine ? ` · <button class="linkish" data-cmdel="${esc(id)}|${esc(c.cid)}">지우기</button>` : ""}</small></div>`;
    }).join("")}</div>` : ""}
    <form class="cm-form" data-cm="${esc(id)}">
      <input type="text" name="t" maxlength="${MAX}" autocomplete="off" placeholder="${PARTNER ? "짝꿍에게 한마디 (예: 여기 꼭 가자!)" : "메모 남기기 (예: 예약 필요)"}" aria-label="메모">
      <button class="btn sm primary" type="submit" aria-label="보내기">${icon("send", 15)}</button>
    </form>
  </div>`;
}

export function addComment(id, text) {
  text = String(text || "").trim().slice(0, MAX);
  if (!text) return false;
  state.comments = state.comments || {};
  const cid = "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  state.comments[id] = { ...(state.comments[id] || {}), [cid]: { by: ME, text, at: Date.now() } };
  save();
  return true;
}
export function removeComment(id, cid) {
  const box = (state.comments || {})[id]; if (!box || !box[cid] || box[cid].by !== ME) return;
  const next = { ...box }; delete next[cid];
  if (Object.keys(next).length) state.comments[id] = next; else delete state.comments[id];
  save();
}

// 열린 장소 창을 다시 그림 (입력 중이던 글은 유지)
export function refreshOpenComments(id) {
  if (!document.querySelector(`.pop [data-cmbox="${CSS.escape(id)}"]`)) return;
  const input = document.querySelector(`.pop [data-cm="${CSS.escape(id)}"] [name=t]`);
  const typed = input && input.value, focused = input && document.activeElement === input;
  openPlace(id, false);
  const again = document.querySelector(`.pop [data-cm="${CSS.escape(id)}"] [name=t]`);
  if (again && typed) again.value = typed;
  if (again && focused) again.focus();
}

export function bindComments(afterChange) {
  document.addEventListener("submit", e => {
    const f = e.target.closest("form.cm-form"); if (!f) return;
    e.preventDefault();
    const id = f.dataset.cm;
    if (!addComment(id, f.t.value)) return;
    f.t.value = "";
    afterChange(id);
    openPlace(id, false);
    const input = document.querySelector(`.pop [data-cm="${CSS.escape(id)}"] [name=t]`); if (input) input.focus();
  });
  document.addEventListener("click", e => {
    const b = e.target.closest("[data-cmdel]"); if (!b) return;
    const [id, cid] = b.dataset.cmdel.split("|");
    removeComment(id, cid); afterChange(id); openPlace(id, false);
  });
}
