import { addToDay, setAddMode, toast } from "./actions.js";
import { commentsHtml } from "./comments.js";
import { GMODE, MODE_ICON, apiErrors, fmtDist, fmtDur, gTextSearch, getLeg } from "./google.js";
import { icon } from "./icons.js";
import { M } from "./map.js";
import { buildMarkers, openPlace, renderChips, renderDays } from "./render.js";
import { CENTER, CITY, byId, esc, isoAdd, km, save, state } from "./store.js";
import { cityRanges, hasTrip } from "./trip.js";

/* ============================== 에어비앤비 숙소 후보 ============================== */
// 에어비앤비는 공개 API가 없어 매물을 자동으로 가져올 수 없음 → 지도 영역으로 검색을 열고, 고른 숙소를 후보로 저장해 비교
export const tripNights = () => Math.max(1, state.days.length - 1);
export const stayNights = p => p.nights || tripNights();
export const fmtMoney = n => Math.round(n).toLocaleString();
export const safeUrl = u => /^https?:\/\//i.test(u || "") ? u : "";
export let pickFn = null;
export function setPickFn(f) { pickFn = f; }   // 지도 클릭으로 위치를 받을 콜백
export let editingStay = null;

export function stayDates() {
  // 여러 도시 일정이면 이 도시에 처음 머무는 구간
  if (hasTrip()) { const r = cityRanges(CITY.id)[0]; return r ? { checkin: r.from, checkout: isoAdd(r.to, 1) } : null; }
  return state.startDate ? { checkin: state.startDate, checkout: isoAdd(state.startDate, tripNights()) } : null;
}
export function airbnbSearchUrl() {
  const q = new URLSearchParams({ adults: state.guests, search_type: "user_map_move", search_by_map: "true" });
  const d = stayDates();
  if (d) { q.set("checkin", d.checkin); q.set("checkout", d.checkout); }
  const b = M.bounds();
  if (b) {
    q.set("ne_lat", b.n.toFixed(5)); q.set("ne_lng", b.e.toFixed(5));
    q.set("sw_lat", b.s.toFixed(5)); q.set("sw_lng", b.w.toFixed(5)); q.set("zoom", Math.round(b.z));
  }
  return `https://www.airbnb.co.kr/s/${encodeURIComponent(CITY.airbnb)}/homes?` + q;
}

// 숙소 → 주요 장소 이동시간 (구글 모드: 대중교통 실제 소요시간, 아니면 직선거리)
export function commute(p, spotId) {
  const t = byId(spotId);
  if (GMODE) {
    const r = getLeg(p, t, "transit");
    if (r && !r.none) return { text: `${MODE_ICON[r.mode]} ${fmtDur(r.sec)}`, sec: r.sec };
    if (!r && !apiErrors.routes) return { text: "계산 중…", sec: 1e9 };
  }
  const k = km(p, t);
  return { text: `직선 ${fmtDist(k * 1000)}`, sec: k * 1.3 / 4.5 * 3600 };
}
export const commuteHtml = p => (CITY.keySpots || []).map(([id, label]) => `${label} <b>${commute(p, id).text}</b>`).join(" · ");

export function stayPriceHtml(p) {
  if (!p.price) return "";
  return `<b>A$${fmtMoney(p.price)}</b> / 박 · ${stayNights(p)}박 총 <b>A$${fmtMoney(p.price * stayNights(p))}</b>`;
}
export function stayPopupHtml(p, opts) {
  const on = state.stayChosen === p.id, url = safeUrl(p.url);
  return `<div class="pop">
    <h3>${icon("house", 18)} ${esc(p.name)} ${on ? `<span class="badge">확정</span>` : ""}</h3>
    <div class="muted">에어비앤비 후보${p.area ? " · " + esc(p.area) : ""}${p.rating ? ` · ★ ${p.rating}` : ""}</div>
    ${p.price ? `<p>${stayPriceHtml(p)}</p>` : ""}
    ${p.note ? `<p>${esc(p.note)}</p>` : ""}
    ${CITY.keySpots.length ? `<div class="commute">${commuteHtml(p)}</div>` : ""}
    <div class="acts">
      ${url ? `<a class="abnb" href="${esc(url)}" target="_blank" rel="noopener">에어비앤비에서 보기</a>` : ""}
      <button class="btn sm" onclick="chooseStay('${p.id}')">${on ? "확정 취소" : `${icon("check", 15)} 이 숙소로 확정`}</button>
      <button class="btn sm" onclick="openStayDlg('${p.id}')">수정</button>
    </div>
    <div class="acts">
      <select id="popDay">${opts}</select>
      <button class="btn sm primary" onclick="addToDay('${p.id}', +document.getElementById('popDay').value)">${icon("plus", 15)} 일정에 추가</button>
    </div>
    ${commentsHtml(p.id)}
  </div>`;
}

export function renderStays() {
  document.getElementById("guests").value = state.guests;
  document.getElementById("staySort").value = state.staySort;
  const d = stayDates();
  document.getElementById("stayDates").innerHTML = d
    ? `체크인 ${d.checkin} → 체크아웃 ${d.checkout} (${tripNights()}박) · 일정 탭의 출발일·일수 기준`
    : `일정 탭에서 출발일을 정하면 날짜까지 넣어서 검색해요`;
  const k0 = (CITY.keySpots || [])[0];
  const sortOpt = document.querySelector('#staySort option[value="commute"]');
  sortOpt.hidden = !k0;
  if (k0) sortOpt.textContent = `${k0[1]} 가까운 순`;
  const sorters = {
    price: (a, b) => (a.price || 1e9) - (b.price || 1e9),
    commute: (a, b) => k0 ? commute(a, k0[0]).sec - commute(b, k0[0]).sec : 0,
    rating: (a, b) => (b.rating || 0) - (a.rating || 0),
    added: () => 0,
  };
  const list = [...state.stays].sort(sorters[state.staySort] || sorters.added)
    .sort((a, b) => (b.id === state.stayChosen) - (a.id === state.stayChosen));
  document.getElementById("stayList").innerHTML = list.length ? list.map(p => {
    const on = state.stayChosen === p.id, url = safeUrl(p.url);
    return `<div class="stay-card ${on ? "on" : ""}">
      <div class="top">
        <span class="nm" data-act="open" data-id="${p.id}">${esc(p.name)} ${on ? `<span class="badge">확정</span>` : ""}</span>
        ${p.price ? `<span class="price">A$${fmtMoney(p.price)}<small>/박</small></span>` : ""}
      </div>
      <div class="muted">${[p.area && esc(p.area), p.rating && `★ ${p.rating}`, p.price && `${stayNights(p)}박 총 A$${fmtMoney(p.price * stayNights(p))}`].filter(Boolean).join(" · ")}</div>
      ${CITY.keySpots.length ? `<div class="commute">${commuteHtml(p)}</div>` : ""}
      ${p.note ? `<div class="note">${esc(p.note)}</div>` : ""}
      <div class="row" style="margin-top:6px">
        <button class="btn sm" data-act="open" data-id="${p.id}">${icon("map", 15)} 지도</button>
        ${url ? `<a class="btn sm abnb" href="${esc(url)}" target="_blank" rel="noopener">에어비앤비</a>` : ""}
        <button class="btn sm" data-act="choose" data-id="${p.id}">${on ? "확정 취소" : `${icon("check", 15)} 확정`}</button>
        <button class="btn sm" data-act="edit" data-id="${p.id}">수정</button>
        <button class="btn sm" data-act="del" data-id="${p.id}">삭제</button>
      </div>
    </div>`;
  }).join("") : `<div class="empty">아직 후보가 없어요. 에어비앤비에서 마음에 드는 숙소를 찾은 뒤 "+ 숙소 후보 추가"를 눌러주세요.</div>`;
}

export function openStayDlg(id) {
  M.closePopup();
  editingStay = id || null;
  const p = (id && byId(id)) || {};
  const f = document.getElementById("stayForm");
  f.reset();
  for (const k of ["url", "name", "price", "rating", "nights", "area", "note"]) f.elements[k].value = p[k] ?? "";
  document.getElementById("stayDlgTitle").textContent = id ? "숙소 후보 수정" : "숙소 후보 추가";
  document.getElementById("stayRepickRow").hidden = !id;
  document.getElementById("stayLocHint").hidden = !!id;
  document.getElementById("stayDlg").showModal();
}
export function submitStay(e) {
  e.preventDefault();
  const f = e.target, v = k => f.elements[k].value.trim(), num = k => v(k) === "" ? null : +v(k);
  const data = { url: v("url"), name: v("name"), price: num("price"), rating: num("rating"), nights: num("nights"), area: v("area"), note: v("note") };
  if (!data.name) return;
  document.getElementById("stayDlg").close();
  if (editingStay) {
    const p = byId(editingStay);
    Object.assign(p, data);
    save(); buildMarkers(); renderStays();
    if (f.elements.repick.checked) pickStayLocation(p);
    return;
  }
  locateNewStay({ id: "s" + Date.now().toString(36), cat: "stay", ...data });
}
export async function locateNewStay(p) {
  if (GMODE && p.area) {   // 주소/동네를 적었으면 구글로 위치를 찾아봄
    try {
      const r = (await gTextSearch(p.area + ", " + CITY.suffix, CENTER, 30000))[0];
      if (r && r.lat != null) {
        p.lat = r.lat; p.lng = r.lng;
        commitStay(p);
        return toast("주소로 위치를 찾았어요. 다르면 수정 → '위치 다시 찍기'");
      }
    } catch (e) {}
  }
  pickStayLocation(p);
}
export function pickStayLocation(p) {
  setAddMode(true, `"${p.name}" 위치를 지도에서 눌러 주세요 (Esc 취소)`);
  pickFn = pos => { p.lat = +pos.lat.toFixed(6); p.lng = +pos.lng.toFixed(6); commitStay(p); };
}
export function commitStay(p) {
  if (!state.stays.includes(p)) state.stays.push(p);
  if (!state.cats.includes("stay")) state.cats.push("stay");
  save(); buildMarkers(); renderChips(); renderStays();
  openPlace(p.id, true);
}
export function chooseStay(id) {
  state.stayChosen = state.stayChosen === id ? null : id;
  save(); M.closePopup(); buildMarkers(); renderStays();
  if (state.stayChosen) toast(`${byId(id).name} 숙소로 확정!`);
}
export function removeStay(id) {
  const p = byId(id);
  if (!p || !confirm(`"${p.name}" 후보를 삭제할까요?`)) return;
  state.stays = state.stays.filter(x => x.id !== id);
  state.days.forEach(d => d.stops = d.stops.filter(s => s !== id));
  if (state.stayChosen === id) state.stayChosen = null;
  save(); M.closePopup(); buildMarkers(); renderDays();
}
window.chooseStay = chooseStay; window.openStayDlg = openStayDlg;
