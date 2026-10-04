import { save, state } from "./store.js";

// 일정 장소를 끌어서 순서 바꾸기·다른 날로 옮기기. 번호 동그라미(손잡이)를 잡고 끌면 됨 (마우스·터치 모두)

let onDrop = () => {};
export function moveStop(from, j, to, k) {
  const src = state.days[from], dst = state.days[to];
  if (!src || !dst || j < 0 || j >= src.stops.length) return false;
  const id = src.stops[j];
  if (from === to) {
    if (k > j) k--;   // 빠진 자리만큼 당겨짐
    if (k === j) return false;
    src.stops.splice(j, 1); src.stops.splice(k, 0, id);
  } else {
    if (dst.stops.includes(id)) return false;   // 그날 이미 있음
    src.stops.splice(j, 1); dst.stops.splice(Math.min(k, dst.stops.length), 0, id);
    // 방문 시간도 따라감
    if (src.times && src.times[id]) { dst.times = { ...(dst.times || {}), [id]: src.times[id] }; delete src.times[id]; }
  }
  return true;
}

export function bindDrag(after) {
  onDrop = after;
  const box = document.getElementById("days");
  let drag = null;

  const clear = () => box.querySelectorAll(".drop-before,.drop-after,.drop-into").forEach(el => el.classList.remove("drop-before", "drop-after", "drop-into"));
  // 손가락 아래의 놓을 자리: { day, index, el, cls }
  function targetAt(x, y) {
    const under = document.elementFromPoint(x, y); if (!under) return null;
    const stop = under.closest("#days .stop"), day = under.closest("#days .day");
    if (!day) return null;
    const di = [...box.querySelectorAll(".day")].indexOf(day);
    if (stop) {
      const r = stop.getBoundingClientRect(), si = +stop.dataset.j;
      return y < r.top + r.height / 2 ? { day: di, index: si, el: stop, cls: "drop-before" } : { day: di, index: si + 1, el: stop, cls: "drop-after" };
    }
    return { day: di, index: state.days[di].stops.length, el: day, cls: "drop-into" };
  }
  function autoscroll(y) {
    const pane = box.closest(".pane"), r = pane.getBoundingClientRect(), edge = 60;
    if (y < r.top + edge) pane.scrollTop -= 12; else if (y > r.bottom - edge) pane.scrollTop += 12;
  }

  box.addEventListener("pointerdown", e => {
    const h = e.target.closest(".stop .n[data-drag]"); if (!h || e.button > 0) return;
    const [i, j] = h.dataset.drag.split(",").map(Number);
    const row = h.closest(".stop"), r = row.getBoundingClientRect();
    drag = { i, j, row, x0: e.clientX, y0: e.clientY, dy: e.clientY - r.top, started: false, ghost: null, target: null, id: e.pointerId };
    try { h.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });
  box.addEventListener("pointermove", e => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.started) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 6) return;
      drag.started = true;
      const r = drag.row.getBoundingClientRect();
      const g = drag.ghost = drag.row.cloneNode(true);
      g.classList.add("drag-ghost"); g.style.width = r.width + "px"; g.style.left = r.left + "px";
      document.body.appendChild(g);
      drag.row.classList.add("dragging");
      document.body.classList.add("is-dragging");
    }
    drag.ghost.style.top = (e.clientY - drag.dy) + "px";
    autoscroll(e.clientY);
    clear();
    const t = drag.target = targetAt(e.clientX, e.clientY);
    if (t) t.el.classList.add(t.cls);
  });
  const end = e => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const d = drag; drag = null;
    clear();
    document.body.classList.remove("is-dragging");
    if (d.ghost) d.ghost.remove();
    d.row.classList.remove("dragging");
    if (!d.started) return;
    if (d.target && moveStop(d.i, d.j, d.target.day, d.target.index)) { save(); onDrop(); }
  };
  box.addEventListener("pointerup", end);
  box.addEventListener("pointercancel", end);
  // 키보드: 손잡이에 초점을 두고 Alt+↑/↓ 로 이동
  box.addEventListener("keydown", e => {
    const h = e.target.closest(".stop .n[data-drag]"); if (!h || !e.altKey || !["ArrowUp", "ArrowDown"].includes(e.key)) return;
    const [i, j] = h.dataset.drag.split(",").map(Number);
    const k = e.key === "ArrowUp" ? j - 1 : j + 2;
    if (k < 0 || k > state.days[i].stops.length) return;
    e.preventDefault();
    if (moveStop(i, j, i, k)) { save(); onDrop(); box.querySelector(`.n[data-drag="${i},${e.key === "ArrowUp" ? j - 1 : j + 1}"]`)?.focus(); }
  });
}
