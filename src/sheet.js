// 휴대폰 화면의 아래 시트(끌어서 높이 조절)와 탭 전환. PC(900px 이상)에서는 왼쪽 패널이라 높이 조절 없음
const isMobile = () => !matchMedia("(min-width: 900px)").matches;
const PEEK = 120;               // 손잡이 + 검색창 정도만 보이는 높이
let mode = "half";              // peek | half | full
let onShow = {};                // 탭이 열릴 때 할 일 (예: 함께 고르기 다시 그리기)

const el = () => document.getElementById("sheet");
function available() {
  const nav = document.querySelector(".tabs").offsetHeight;
  const top = document.querySelector(".topbar").offsetHeight;
  return Math.max(PEEK + 40, window.innerHeight - nav - top - 8);
}
function heightFor(m) {
  const a = available();
  return m === "peek" ? PEEK : m === "full" ? a : Math.round(Math.min(a, Math.max(PEEK + 120, a * 0.52)));
}
export function setSheet(m) {
  mode = m;
  if (!isMobile()) { el().style.removeProperty("--sheet-h"); return; }
  el().style.setProperty("--sheet-h", heightFor(m) + "px");
}
// 지도 위 팝업을 열 때: 시트가 가리지 않게 내림
export function peekSheet() { if (isMobile() && mode !== "peek") setSheet("peek"); }

export function showTab(name) {
  document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b.dataset.tab === name));
  document.querySelectorAll(".pane").forEach(p => p.classList.toggle("on", p.id === "pane-" + name));
  if (isMobile()) setSheet(name === "pick" ? "full" : mode === "peek" ? "half" : mode);
  if (onShow[name]) onShow[name]();
}
export function onTabShown(name, fn) { onShow[name] = fn; }

export function bindSheet() {
  document.querySelectorAll(".tabs button").forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));
  const handle = document.getElementById("sheetHandle"), sheet = el();
  let y0 = null, h0 = 0, moved = false;
  handle.addEventListener("pointerdown", e => {
    if (!isMobile()) return;
    y0 = e.clientY; h0 = sheet.offsetHeight; moved = false;
    handle.setPointerCapture(e.pointerId); sheet.classList.add("dragging");
  });
  handle.addEventListener("pointermove", e => {
    if (y0 === null) return;
    const dy = e.clientY - y0;
    if (Math.abs(dy) > 4) moved = true;
    sheet.style.setProperty("--sheet-h", Math.max(PEEK - 40, Math.min(available(), h0 - dy)) + "px");
  });
  const end = () => {
    if (y0 === null) return;
    y0 = null; sheet.classList.remove("dragging");
    if (!moved) return setSheet(mode === "peek" ? "half" : mode === "half" ? "full" : "half");   // 탭하면 단계별로
    const h = sheet.offsetHeight;
    const nearest = ["peek", "half", "full"].map(m => [m, Math.abs(heightFor(m) - h)]).sort((a, b) => a[1] - b[1])[0][0];
    setSheet(nearest);
  };
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
  handle.addEventListener("keydown", e => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSheet(mode === "full" ? "half" : "full"); }
  });
  window.addEventListener("resize", () => setSheet(mode));
  setSheet("half");
}
