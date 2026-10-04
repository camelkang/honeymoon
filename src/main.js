import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./styles.css";
import { bindUI, toast } from "./actions.js";
import { bindBookings } from "./bookings.js";
import { renderCityBar } from "./cities.js";
import { bindComments } from "./comments.js";
import { bindDiary } from "./diary.js";
import { bindDrag } from "./drag.js";
import { setGMode } from "./google.js";
import { icon } from "./icons.js";
import { API_KEY, createMap, setMap } from "./map.js";
import { bindOffline } from "./offline.js";
import { bindOnboard, maybeOnboard } from "./onboard.js";
import { bindPick, renderPick } from "./pick.js";
import { bindPrep, renderPrep, todayStr, tripDay } from "./prep.js";
import { setupPWA } from "./pwa.js";
import { buildMarkers, filter, openPlace, renderChips, renderDays } from "./render.js";
import { bindSheet, onTabShown, showTab } from "./sheet.js";

function start(adapter) {
  setMap(adapter);
  // 정적 HTML의 아이콘 자리(data-icon)에 아이콘을 채움
  document.querySelectorAll("[data-icon]").forEach(el => { el.insertAdjacentHTML("afterbegin", icon(el.dataset.icon, 20)); });
  buildMarkers(); renderChips(); renderDays(); renderCityBar(); bindUI(); setupPWA();
  bindSheet(); bindPick(); renderPick();
  onTabShown("pick", renderPick);
  bindComments(() => { filter(); renderPick(); });
  bindDrag(renderDays);
  bindOffline(toast);
  bindDiary((kind, id) => { if (kind === "rating") openPlace(id, false); else { renderDays(); renderPrep(); } });
  bindPrep(); renderPrep();
  bindBookings(() => { renderPrep(); renderDays(); });
  onTabShown("prep", renderPrep);
  bindOnboard();
  if (maybeOnboard()) return;
  // 홈 화면 바로가기(?tab=plan 등)로 열면 그 탭부터
  const want = new URLSearchParams(location.search).get("tab");
  if (["places", "pick", "plan", "stays", "prep"].includes(want)) return showTab(want);
  // 여행 중이면 하루에 한 번, 앱을 열 때 오늘 일정부터 보여줌
  try {
    if (tripDay() !== null && localStorage.getItem("today-opened") !== todayStr()) {
      localStorage.setItem("today-opened", todayStr());
      showTab("plan");
    }
  } catch (e) {}
}

// 키가 있으면 구글 검색·경로·장소 정보를 켬 (지도 자체는 항상 무료 지도)
if (API_KEY) { setGMode(true); document.body.classList.add("gmode"); }
start(createMap());

// 로그인·짝꿍 동기화는 첫 화면이 뜬 뒤에 불러옴 (Firebase가 커서 첫 로딩을 늦추지 않게)
import("./sync.js").then(m => m.initSync()).catch(e => console.warn("sync unavailable", e));
