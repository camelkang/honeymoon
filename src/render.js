import { addToDay, removeCustom, saveTemp } from "./actions.js";
import { bookingChips, dateOfDay } from "./bookings.js";
import { commentCount, commentsHtml } from "./comments.js";
import { CATS, DAY_COLORS } from "./data.js";
import { diaryHtml, ratingHtml } from "./diary.js";
import { GMODE, apiErrors, decodePolyline, detailsHtml, fmtDist, fmtDur, gTextSearch, gcache, getDetails, getLeg, saveCache } from "./google.js";
import { icon } from "./icons.js";
import { M } from "./map.js";
import { isMatch, myVote, partnerVote, renderSuggest, toggleLike } from "./pick.js";
import { todayCardHtml, tripDay } from "./prep.js";
import { peekSheet } from "./sheet.js";
import { renderStays, stayPopupHtml } from "./stays.js";
import { CENTER, CITY, PLACES, SAMPLE, allPlaces, byId, esc, gDirUrl, gPlaceUrl, km, state, tempPlaces } from "./store.js";
import { loadWeather, weatherChip } from "./weather.js";

/* ============================== 렌더링 ============================== */
export const markers = {};      // placeId -> marker
export let routeLayers = [];    // 동선 레이어
export let addMode = false;
export function setAddModeFlag(v) { addMode = v; }

export function stayLabel(p) { return p.price ? "A$" + Math.round(p.price) : "숙소"; }
// 하트 표시: 둘 다 좋아요 / 나만 / 짝꿍만
function heartBadge(id) {
  const mine = myVote(id) === 1, theirs = partnerVote(id) === 1;
  if (!mine && !theirs) return "";
  const cls = mine && theirs ? "both" : mine ? "mine" : "partner";
  return `<span class="pin-heart ${cls}" title="${mine && theirs ? "둘 다 좋아요" : mine ? "내가 좋아요" : "짝꿍이 좋아요"}">${icon("heart", 12, 'fill="currentColor" stroke-width="0"')}</span>`;
}
export function pinHtml(p) {
  if (p.cat === "stay") return `<div class="stay-pin ${state.stayChosen === p.id ? "on" : ""}">${esc(stayLabel(p))}</div>`;
  const c = CATS[p.cat] || CATS.mine;
  return `<div class="pin" style="--c:${c.color}">${icon(c.icon, 16)}${heartBadge(p.id)}</div>`;
}
function heartsInline(id) {
  const mine = myVote(id) === 1, theirs = partnerVote(id) === 1;
  if (!mine && !theirs) return "";
  return `<span class="hearts" title="${mine && theirs ? "둘 다 좋아요" : mine ? "내가 좋아요" : "짝꿍이 좋아요"}">${mine ? `<span class="${theirs ? "" : "mine"}">${icon("heart", 14, 'fill="currentColor"')}</span>` : ""}${theirs ? icon("heart", 14, mine ? 'fill="currentColor"' : "") : ""}</span>`;
}

// 핀을 누르면 장소 팝업. 단, 위치를 찍는 중(장소 추가·숙소 위치)이면 그 핀 자리를 찍은 것으로 처리
function tapPlace(p) {
  if (addMode) return M.tapAt({ lat: p.lat, lng: p.lng });
  openPlace(p.id, false);
}

export function buildMarkers() {
  Object.values(markers).forEach(m => m.show(false));
  for (const k in markers) delete markers[k];
  allPlaces().forEach(p => {
    const c = CATS[p.cat];
    markers[p.id] = M.pin(p, pinHtml(p), () => tapPlace(p), c.color, c.emoji);
  });
  filter();
}

export function dayLabel(i) {
  if (!state.startDate) return `Day ${i+1}`;
  const d = new Date(state.startDate + "T00:00:00"); d.setDate(d.getDate() + i);
  const wd = "일월화수목금토"[d.getDay()];
  return `Day ${i+1} · ${d.getMonth()+1}/${d.getDate()}(${wd})`;
}

export function popupHtml(p) {
  const c = CATS[p.cat];
  const inDays = state.days.map((d,i) => d.stops.includes(p.id) ? i+1 : null).filter(Boolean);
  const opts = state.days.map((_,i) => `<option value="${i}">${esc(dayLabel(i))}</option>`).join("");
  if (p.cat === "stay") return stayPopupHtml(p, opts);
  const liked = myVote(p.id) === 1;
  return `<div class="pop" style="--c:${c.color}">
    <h3>${icon(c.icon, 18)} ${esc(p.name)}</h3>
    <div class="muted">${esc(c.label)}${p.area ? " · " + esc(p.area) : ""}${p.en ? " · " + esc(p.en) : ""}</div>
    ${p.desc ? `<p>${esc(p.desc)}</p>` : ""}
    ${p.tip ? `<p class="tip">${esc(p.tip)}</p>` : ""}
    ${partnerVote(p.id) === 1 ? `<p class="partner-like">${icon("heart", 14, 'fill="currentColor"')} 짝꿍이 좋아요${liked ? " · 둘 다 좋아요!" : ""}</p>` : ""}
    ${inDays.length ? `<p class="muted">일정 포함: ${inDays.map(n => "Day " + n).join(", ")}</p>` : ""}
    <div class="acts">
      ${tempPlaces[p.id] ? "" : `<button class="btn sm heart-btn ${liked ? "on" : ""}" onclick="toggleLike('${p.id}')" aria-pressed="${liked}">${icon("heart", 15, liked ? 'fill="currentColor"' : "")} 좋아요</button>`}
      <select id="popDay" aria-label="날짜">${opts}</select>
      <button class="btn sm primary" onclick="addToDay('${p.id}', +document.getElementById('popDay').value)">${icon("plus", 15)} 일정에 추가</button>
    </div>
    <div class="acts">
      <a class="g" href="${gPlaceUrl(p)}" target="_blank" rel="noopener">구글맵에서 보기</a>
      ${tempPlaces[p.id] ? `<button class="btn sm" onclick="saveTemp('${p.id}')">${icon("star", 15)} 내 장소로 저장</button>`
        : p.cat === "mine" ? `<button class="btn sm" onclick="removeCustom('${p.id}')">${icon("trash", 15)} 삭제</button>` : ""}
    </div>
    ${tempPlaces[p.id] ? "" : ratingHtml(p.id) + commentsHtml(p.id)}
    ${GMODE ? `<div class="gd"><span class="muted">구글 장소 정보 불러오는 중…</span></div>` : ""}
  </div>`;
}

export let popSeq = 0;
export function openPlace(id, fly = true) {
  const p = byId(id); if (!p) return;
  peekSheet();   // 휴대폰: 팝업이 보이도록 아래 시트를 내림
  if (fly) M.fly(p, 15);
  const node = document.createElement("div");
  node.innerHTML = popupHtml(p);
  M.popup(p, node);
  if (!GMODE || p.cat === "stay") return;
  const seq = ++popSeq;
  getDetails(p).then(d => {
    if (seq !== popSeq) return;
    if (d && tempPlaces[p.id]) {   // 구글 장소를 처음 연 경우: 이름·위치를 구글 정보로 채움
      Object.assign(p, { name: d.name || p.name, gid: d.gid || p.gid, desc: d.type || "", lat: d.lat ?? p.lat, lng: d.lng ?? p.lng });
      node.innerHTML = popupHtml(p);
    }
    node.querySelector(".gd").innerHTML = detailsHtml(d);
  }).catch(e => {
    if (seq === popSeq) node.querySelector(".gd").innerHTML = `<span class="muted">구글 장소 정보를 불러오지 못했어요 (${esc(e.message)})</span>`;
  });
}

// 지도 위 가게·명소 아이콘 클릭 → 우리 팝업으로 열기 (구글 모드면 이름으로 구글 장소 정보를 찾아 붙임)
export function showPoi(poi) {
  const near = allPlaces().find(p => km(p, poi) < 0.03);
  if (near) return openPlace(near.id, false);
  const id = ("o_" + poi.lat.toFixed(5) + "_" + poi.lng.toFixed(5)).replace(/[^\w]/g, "x");
  tempPlaces[id] = tempPlaces[id] || { id, cat: "mine", name: poi.name, en: poi.name, lat: poi.lat, lng: poi.lng, area: "", desc: "" };
  openPlace(id, false);
}

export async function googleSearch() {
  const q = document.getElementById("q").value.trim();
  const box = document.getElementById("gResults");
  if (!q) { box.innerHTML = ""; return; }
  box.innerHTML = `<div class="muted" style="margin:8px 0">구글에서 "${esc(q)}" 검색 중…</div>`;
  try {
    const list = (await gTextSearch(q, CENTER, 30000)).slice(0, 10).map(d => {
      const saved = allPlaces().find(p => p.gid === d.gid);
      if (saved) return saved;
      const id = "g_" + d.gid.replace(/[^\w-]/g, "");
      gcache.det[id] = d;
      return tempPlaces[id] = Object.assign(tempPlaces[id] || {}, { id, gid:d.gid, cat:"mine", name:d.name, lat:d.lat, lng:d.lng, desc:d.type || "", area:"" });
    });
    saveCache();
    box.innerHTML = `<div class="row" style="justify-content:space-between;margin:10px 0 4px">
        <b>구글 검색 결과 ${list.length}곳</b><button class="btn sm" data-gclose>닫기</button></div>` +
      (list.length ? list.map(p => {
        const d = gcache.det[p.id] || {};
        return `<div class="gres" data-id="${p.id}"><div class="nm">${esc(p.name)}
          ${d.rating ? `<span class="stars" style="color:#e67700">★ ${d.rating.toFixed(1)}</span>` : ""}</div>
          <div class="muted">${esc(d.addr || p.desc || "")}</div></div>`;
      }).join("") : `<div class="empty">검색 결과가 없어요.</div>`);
    if (list.length) M.fit(list);
    if (list.length === 1) openPlace(list[0].id, false);
  } catch (e) {
    box.innerHTML = `<div class="notice">구글 검색 실패: ${esc(e.message)}</div>`;
  }
}

export function renderChips() {
  const el = document.getElementById("chips");
  const lf = state.likeFilter || "all";
  el.innerHTML = `<button class="chip ${lf === "match" ? "love-on" : ""}" data-like="match">${icon("heart", 15, 'fill="currentColor"')} 둘 다 좋아요</button>`
    + `<button class="chip ${lf === "liked" ? "love-on" : ""}" data-like="liked">${icon("heart", 15)} 내가 좋아요</button><span class="chip-sep"></span>`
    + Object.entries(CATS).map(([k,c]) =>
    `<button class="chip ${state.cats.includes(k) ? "" : "off"}" data-cat="${k}" style="--c:${c.color}">${icon(c.icon, 15)} ${c.label}</button>`
  ).join("") + `<button class="chip" data-cat="__all">전체</button>`;
}

export function matches(p, q) {
  if (!state.cats.includes(p.cat)) return false;
  if (state.likeFilter === "match" && !isMatch(p.id)) return false;
  if (state.likeFilter === "liked" && myVote(p.id) !== 1) return false;
  if (!q) return true;
  const hay = [p.name, p.en, p.desc, p.area, CATS[p.cat].label].join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).every(t => hay.includes(t));
}

export function filter() {
  const q = document.getElementById("q").value.trim();
  const inPlan = new Set(state.days.flatMap(d => d.stops));
  const list = allPlaces().filter(p => matches(p, q));
  allPlaces().forEach(p => markers[p.id] && markers[p.id].show(matches(p, q) || inPlan.has(p.id)));
  document.getElementById("list").innerHTML = list.length ? list.map(p => {
    const c = CATS[p.cat];
    const days = state.days.map((d,i) => d.stops.includes(p.id) ? "D" + (i+1) : null).filter(Boolean);
    return `<div class="place" data-id="${p.id}" style="--c:${c.color}">
      <span class="cat-ico">${icon(c.icon, 20)}</span>
      <div class="txt"><div class="nm"><span>${esc(p.name)}</span>${heartsInline(p.id)}${commentCount(p.id) ? `<span class="cm-n" title="메모 ${commentCount(p.id)}개">${icon("messageCircle", 13)}${commentCount(p.id)}</span>` : ""}${days.length ? `<span class="tag">${days.join(" ")}</span>` : ""}</div>
      <div class="ds">${esc(p.area || c.label)}${p.desc ? " · " + esc(p.desc) : ""}</div></div>
    </div>`;
  }).join("") : !PLACES.length && !q
    ? `<div class="empty">${esc(CITY.name)}은(는) 추천 장소가 아직 없어요.<br>${GMODE ? "구글 검색이나 지도 위 장소 클릭," : "오른쪽 위 핀 버튼으로"} 가고 싶은 곳을 담아보세요.</div>`
    : state.likeFilter && state.likeFilter !== "all"
      ? `<div class="empty">${state.likeFilter === "match" ? "아직 둘 다 좋아한 곳이 없어요. 함께 고르기 탭에서 골라 보세요." : "아직 좋아요한 곳이 없어요."}</div>`
      : `<div class="empty">검색 결과가 없습니다.</div>`;
}

// 날씨를 새로 받으면 날씨 칸만 바꿈 (메모를 쓰는 중이어도 방해하지 않게)
export function refreshWeather() {
  document.querySelectorAll("[data-wx]").forEach(el => { el.innerHTML = weatherChip(el.dataset.wx); });
}
export function renderDays() {
  document.getElementById("dayCount").textContent = state.days.length;
  document.getElementById("btnSample").hidden = !SAMPLE;
  document.getElementById("startDate").value = state.startDate;
  document.getElementById("mode").value = state.mode;
  document.getElementById("routesOn").checked = state.routesOn;
  const today = tripDay();
  document.getElementById("todayCard").innerHTML = todayCardHtml();
  document.getElementById("days").innerHTML = state.days.map((d, i) => {
    const color = DAY_COLORS[i % DAY_COLORS.length];
    const stops = d.stops.map(byId).filter(Boolean);
    let total = 0, totalSec = 0;
    const rows = stops.map((p, j) => {
      let leg = "";
      if (j > 0) {
        const r = getLeg(stops[j-1], p, state.mode);
        if (r && !r.none) {
          total += r.m / 1000; totalSec += r.sec;
          leg = `<div class="leg real">${icon(r.mode === "walking" ? "walk" : r.mode === "driving" ? "car" : "train", 14)} ${fmtDur(r.sec)} · ${fmtDist(r.m)}${r.lines.length ? " · " + esc(r.lines.join(" → ")) : ""}</div>`;
        } else {
          const k = km(stops[j-1], p); total += k;
          leg = `<div class="leg">${icon("walk", 14)} ${GMODE && !r && !apiErrors.routes ? "경로 계산 중… · " : ""}직선 ${fmtDist(k * 1000)}${k < 2.5 ? ` · 도보 약 ${Math.max(1, Math.round(k * 1.3 / 4.5 * 60))}분` : ""}</div>`;
        }
      }
      return `${leg}<div class="stop" data-j="${j}">
        <div class="n" style="background:${color}" data-drag="${i},${j}" tabindex="0" role="button" title="끌어서 순서 바꾸기 (Alt+↑/↓)" aria-label="${j+1}번, 끌어서 순서 바꾸기">${j+1}</div>
        <div class="nm" data-open="${p.id}"><span>${esc(p.name)}</span>${heartsInline(p.id)}</div>
        <input type="time" data-time="${i}|${p.id}" value="${esc((d.times || {})[p.id] || "")}" title="방문 시간" aria-label="방문 시간">
        <div class="acts">
        <button class="btn icon" title="위로" aria-label="위로" data-mv="${i},${j},-1" ${j===0?"disabled":""}>${icon("up", 15)}</button>
        <button class="btn icon" title="아래로" aria-label="아래로" data-mv="${i},${j},1" ${j===stops.length-1?"disabled":""}>${icon("down", 15)}</button>
        <button class="btn icon" title="다른 날로" aria-label="다른 날로" data-shift="${i},${j}">${icon("swap", 15)}</button>
        <button class="btn icon" title="삭제" aria-label="삭제" data-rm="${i},${j}">${icon("x", 15)}</button>
        </div>
      </div>`;
    }).join("");
    const url = gDirUrl(stops, state.mode);
    return `<div class="day ${today === i ? "is-today" : ""}">
      <div class="day-h">
        <div class="sw" style="background:${color}"></div>
        <div class="t">${esc(dayLabel(i))}${dateOfDay(i) ? `<span class="wx-slot" data-wx="${dateOfDay(i)}">${weatherChip(dateOfDay(i))}</span>` : ""}</div>${today === i ? `<span class="pill">오늘</span>` : ""}
        <span class="muted">${stops.length}곳${total ? ` · ${total.toFixed(1)}km` : ""}${totalSec ? ` · 이동 ${fmtDur(totalSec)}` : ""}</span>
        <button class="btn icon ${state.focusDay === i ? "active" : ""}" data-focus="${i}" title="이 날만 지도에 표시" aria-label="이 날만 지도에 표시">${icon("eye", 16)}</button>
      </div>
      <div class="day-b">
        ${bookingChips(dateOfDay(i))}
        ${rows || `<div class="empty">둘러보기·함께 고르기에서 장소를 담아보세요.</div>`}
        ${diaryHtml(i)}
        <textarea data-note="${i}" placeholder="메모 (예약 시간, 준비물 등)">${esc(d.note)}</textarea>
        ${url ? `<div class="row" style="margin-top:6px">
          <a class="btn sm" href="${url}" target="_blank" rel="noopener">${icon("navigation", 15)} 구글맵 앱으로 길안내</a>
          <button class="btn sm" data-share="${i}">${icon("share", 15)} 이미지로 공유</button>
          ${stops.length >= 3 ? `<button class="btn sm" data-opt="${i}" title="첫 장소는 그대로 두고 이동 거리가 가장 짧은 순서로">${icon("sparkles", 15)} 동선 자동 정리</button>` : ""}
          ${stops.length > 10 ? `<span class="muted">경유지는 최대 9곳까지 반영될 수 있어요.</span>` : ""}
        </div>` : ""}
      </div>
    </div>`;
  }).join("");
  drawRoutes();
  filter();
  renderStays();
  renderSuggest();
  loadWeather(refreshWeather);
}

export function drawRoutes() {
  routeLayers.forEach(l => l.remove()); routeLayers = [];
  if (!state.routesOn) return;
  state.days.forEach((d, i) => {
    if (state.focusDay !== null && state.focusDay !== i) return;
    const color = DAY_COLORS[i % DAY_COLORS.length];
    const stops = d.stops.map(byId).filter(Boolean);
    for (let j = 1; j < stops.length; j++) {
      const r = GMODE ? getLeg(stops[j-1], stops[j], state.mode) : null;
      routeLayers.push(r && r.poly ? M.line(decodePolyline(r.poly), color, true) : M.line([stops[j-1], stops[j]], color, false));
    }
    stops.forEach((p, j) => {
      const html = `<div class="num" style="background:${color}">${j+1}</div>`;
      routeLayers.push(M.num(p, html, () => tapPlace(p), color, j+1));
    });
  });
}
