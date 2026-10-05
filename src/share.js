import { toast } from "./actions.js";
import { DAY_COLORS } from "./data.js";
import { dayLabel } from "./render.js";
import { CITY, allCities, app, byId, dateOfDay, placeIn, state } from "./store.js";
import { cityOf, hasTrip, segments, tripDates } from "./trip.js";
import { weatherOn } from "./weather.js";

// 일정을 예쁜 카드 이미지로 만들어 공유 (카톡·인스타). 휴대폰은 공유 창, PC는 PNG 내려받기

const W = 1080, PAD = 72, FONT = '"Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';
const f = (w, px) => `${w} ${px}px ${FONT}`;

function wrap(ctx, text, maxW) {
  const out = []; let line = "";
  for (const ch of String(text)) {
    if (ctx.measureText(line + ch).width > maxW && line) { out.push(line); line = ch.trimStart(); } else line += ch;
  }
  if (line) out.push(line);
  return out;
}
function ellipsize(ctx, text, maxW) {
  if (ctx.measureText(text).width <= maxW) return text;
  let t = text; while (t && ctx.measureText(t + "…").width > maxW) t = t.slice(0, -1);
  return t + "…";
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }

// 공통 틀: 위쪽 그라데이션 머리말 + 흰 카드 + 아래 서명
function frame(height, title, subtitle, draw, header) {
  const c = document.createElement("canvas"); c.width = W; c.height = height;
  const ctx = c.getContext("2d");
  const g = ctx.createLinearGradient(0, 0, W, height);
  g.addColorStop(0, "#0e7c7b"); g.addColorStop(0.6, "#17a8a4"); g.addColorStop(1, "#f3a6ae");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, height);
  ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.font = f(700, 34);
  ctx.fillText(`♥ 둘이서  ·  ${header || `${CITY.flag || ""} ${CITY.name}`}`, PAD, 110);
  ctx.fillStyle = "#fff"; ctx.font = f(800, 72); ctx.fillText(title, PAD, 205);
  if (subtitle) { ctx.font = f(600, 36); ctx.fillStyle = "rgba(255,255,255,.92)"; ctx.fillText(subtitle, PAD, 262); }
  const top = 310, bottom = height - 120;
  ctx.fillStyle = "#fff"; roundRect(ctx, PAD - 24, top, W - 2 * PAD + 48, bottom - top, 44); ctx.fill();
  draw(ctx, top + 56, bottom);
  ctx.fillStyle = "rgba(255,255,255,.85)"; ctx.font = f(600, 28);
  ctx.fillText("camelkang.github.io/honeymoon", PAD, height - 52);
  return c;
}

function stopsOf(i) { return state.days[i].stops.map(byId).filter(Boolean); }

export function dayImage(i) {
  const stops = stopsOf(i), times = state.days[i].times || {}, color = DAY_COLORS[i % DAY_COLORS.length];
  const measure = document.createElement("canvas").getContext("2d");
  measure.font = f(500, 32);
  const noteLines = state.days[i].note ? wrap(measure, state.days[i].note, W - 2 * PAD - 40).slice(0, 4) : [];
  const height = Math.max(1350, 310 + 56 + stops.length * 108 + (noteLines.length ? 40 + noteLines.length * 46 : 0) + 200);
  const w = weatherOn(dateOfDay(i));
  const [label, date] = dayLabel(i).split(" · ");
  return frame(height, label, [date, w && w.kind === "forecast" ? `${w.icon} ${Math.round(w.max)}° / ${Math.round(w.min)}°` : ""].filter(Boolean).join("   "), (ctx, y) => {
    if (!stops.length) { ctx.fillStyle = "#8a909c"; ctx.font = f(600, 36); ctx.fillText("아직 담은 장소가 없어요", PAD + 20, y + 20); return; }
    stops.forEach((p, k) => {
      const cy = y + k * 108;
      if (k < stops.length - 1) { ctx.strokeStyle = color + "55"; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(PAD + 34, cy + 34); ctx.lineTo(PAD + 34, cy + 108); ctx.stroke(); }
      ctx.fillStyle = color; ctx.beginPath(); ctx.arc(PAD + 34, cy, 30, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.font = f(800, 30); ctx.textAlign = "center"; ctx.fillText(String(k + 1), PAD + 34, cy + 11); ctx.textAlign = "left";
      const t = times[p.id];
      ctx.fillStyle = "#15171f"; ctx.font = f(700, 40);
      ctx.fillText(ellipsize(ctx, p.name, W - 2 * PAD - 120 - (t ? 130 : 0)), PAD + 90, cy + 8);
      if (p.area) { ctx.fillStyle = "#8a909c"; ctx.font = f(500, 26); ctx.fillText(ellipsize(ctx, p.area, W - 2 * PAD - 140), PAD + 90, cy + 46); }
      if (t) { ctx.fillStyle = color; ctx.font = f(800, 34); ctx.textAlign = "right"; ctx.fillText(t, W - PAD - 20, cy + 8); ctx.textAlign = "left"; }
    });
    if (noteLines.length) {
      let ny = y + stops.length * 108 + 10;
      ctx.fillStyle = "#4e5564"; ctx.font = f(500, 32);
      noteLines.forEach(l => { ctx.fillText(l, PAD + 20, ny); ny += 46; });
    }
  });
}

// 전체 일정: 여러 도시 일정표가 있으면 날짜순으로 도시를 넘나들며 (Day 3 · 11/17(화) · 케언즈)
export function tripImage() {
  const md = d => { const x = new Date(d + "T00:00:00"); return `${x.getMonth() + 1}/${x.getDate()}(${"일월화수목금토"[x.getDay()]})`; };
  const rows = hasTrip()
    ? tripDates().map((date, k) => {
        const city = cityOf(date), plan = app.plans[city] || { days: [] }, day = plan.days.find(d => d.date === date);
        return { label: `Day ${k + 1} · ${md(date)} · ${(allCities()[city] || {}).name || ""}`, names: day ? day.stops.map(id => (placeIn(city, id) || {}).name).filter(Boolean) : [] };
      })
    : state.days.map((_, i) => ({ label: dayLabel(i), names: stopsOf(i).map(p => p.name) }));
  const height = Math.max(1350, 310 + 56 + rows.length * 150 + 200);
  const subtitle = hasTrip() ? `${md(app.trip.start)} ~ ${md(app.trip.end)}` : (() => { const a = dayLabel(0).split(" · ")[1], b = dayLabel(rows.length - 1).split(" · ")[1]; return a ? `${a} ~ ${b}` : ""; })();
  const header = hasTrip() ? segments().map(sg => (allCities()[sg.city] || {}).name).join(" → ") : null;
  return frame(height, `${rows.length}일 여행`, subtitle, (ctx, y) => {
    rows.forEach((r, i) => {
      const cy = y + i * 150, color = DAY_COLORS[i % DAY_COLORS.length], maxW = W - 2 * PAD - 60;
      ctx.fillStyle = color; roundRect(ctx, PAD, cy - 34, 12, 96, 6); ctx.fill();
      ctx.fillStyle = "#15171f"; ctx.font = f(800, 38); ctx.fillText(ellipsize(ctx, r.label, maxW), PAD + 36, cy + 4);
      ctx.fillStyle = "#4e5564"; ctx.font = f(500, 30);
      const lines = wrap(ctx, r.names.join(" → ") || "아직 비어 있어요", maxW);
      lines.slice(0, 2).forEach((l, k) => ctx.fillText(k === 1 && lines.length > 2 ? ellipsize(ctx, l + "…", maxW) : l, PAD + 36, cy + 50 + k * 40));
    });
  }, header);
}

export async function shareImage(kind, i) {
  try { await document.fonts.load(f(800, 40)); } catch (e) {}
  const canvas = kind === "trip" ? tripImage() : dayImage(i);
  // 파일 이름은 영문으로 (일부 브라우저가 한글 이름을 무시함)
  const name = kind === "trip" ? `duriseo-${hasTrip() ? "trip" : CITY.id + "-trip"}.png` : `duriseo-${CITY.id}-day${i + 1}.png`;
  const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
  if (!blob) return toast("이미지를 만들지 못했어요");
  const file = new File([blob], name, { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: `${CITY.name} 여행 일정` }); return; }
    catch (e) { if (e.name === "AbortError") return; }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast("일정 이미지를 저장했어요");
}
