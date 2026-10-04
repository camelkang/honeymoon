import { icon } from "./icons.js";
import { CITY, state } from "./store.js";

// 일정 날짜별 날씨: 16일 안은 예보, 그보다 먼 날은 작년 같은 날 날씨로 분위기만 (Open-Meteo, 키 불필요)

const KEY = "wx-cache-v1";
const FORECAST_DAYS = 16;
let cache = {};
try { cache = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) {}
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(cache)); } catch (e) {} };

const CODES = [
  [[0], "☀️", "맑음"], [[1], "🌤️", "대체로 맑음"], [[2], "⛅", "구름 조금"], [[3], "☁️", "흐림"],
  [[45, 48], "🌫️", "안개"], [[51, 53, 55, 56, 57], "🌦️", "이슬비"], [[61, 63, 65, 66, 67, 80, 81, 82], "🌧️", "비"],
  [[71, 73, 75, 77, 85, 86], "🌨️", "눈"], [[95, 96, 99], "⛈️", "뇌우"],
];
export const describe = code => { const c = CODES.find(([list]) => list.includes(code)); return c ? { icon: c[1], label: c[2] } : { icon: "🌡️", label: "" }; };

const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (s, n) => { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return iso(d); };
const lastYear = s => { const [y, m, d] = s.split("-"); return `${+y - 1}-${m}-${m === "02" && d === "29" ? "28" : d}`; };
const place = () => `${CITY.id}@${CITY.center.lat.toFixed(2)},${CITY.center.lng.toFixed(2)}`;

// 그날 날씨 (없으면 null): { icon, label, max, min, pop, kind: "forecast" | "lastyear" }
export function weatherOn(date) {
  const c = cache[place()]; if (!c || !date) return null;
  const w = (c.days || {})[date]; if (!w) return null;
  return { ...describe(w.code), ...w };
}
export function weatherChip(date) {
  const w = weatherOn(date); if (!w) return "";
  const t = `${Math.round(w.max)}° / ${Math.round(w.min)}°`;
  return w.kind === "forecast"
    ? `<span class="wx" title="${w.label} · 최고 ${Math.round(w.max)}° 최저 ${Math.round(w.min)}°">${w.icon} ${t}${w.pop != null && w.pop >= 20 ? ` <b class="wx-rain">☔ ${w.pop}%</b>` : ""}</span>`
    : `<span class="wx past" title="예보 전이라 작년 같은 날 날씨예요 (${w.label})">작년 ${w.icon} ${t}</span>`;
}

let loading = false, failedAt = 0;
// 여행 날짜에 필요한 날씨를 불러와 캐시. 새로 받은 게 있으면 onDone 호출
export async function loadWeather(onDone) {
  if (!state.startDate || loading || Date.now() - failedAt < 10 * 60e3) return;
  const dates = state.days.map((_, i) => addDays(state.startDate, i));
  const today = iso(new Date()), last = addDays(today, FORECAST_DAYS - 1);
  const c = cache[place()] || (cache[place()] = { days: {}, forecastAt: 0 });
  const needForecast = dates.filter(d => d >= today && d <= last);
  const needPast = dates.filter(d => d > last && !(c.days[d] && c.days[d].kind === "lastyear"));
  const staleForecast = needForecast.length && (Date.now() - c.forecastAt > 3 * 3600e3 || needForecast.some(d => !c.days[d] || c.days[d].kind !== "forecast"));
  if (!staleForecast && !needPast.length) return;
  loading = true;
  const { lat, lng } = CITY.center;
  const q = `latitude=${lat}&longitude=${lng}&timezone=auto&daily=weather_code,temperature_2m_max,temperature_2m_min`;
  let changed = false;
  try {
    if (staleForecast) {
      const j = await (await fetch(`https://api.open-meteo.com/v1/forecast?${q},precipitation_probability_max&start_date=${needForecast[0]}&end_date=${needForecast[needForecast.length - 1]}`)).json();
      const d = j.daily || {};
      (d.time || []).forEach((t, k) => {
        if (d.temperature_2m_max[k] == null) return;
        c.days[t] = { kind: "forecast", code: d.weather_code[k], max: d.temperature_2m_max[k], min: d.temperature_2m_min[k], pop: d.precipitation_probability_max ? d.precipitation_probability_max[k] : null };
        changed = true;
      });
      c.forecastAt = Date.now();
    }
    if (needPast.length) {
      const from = lastYear(needPast[0]), to = lastYear(needPast[needPast.length - 1]);
      const j = await (await fetch(`https://archive-api.open-meteo.com/v1/archive?${q}&start_date=${from}&end_date=${to}`)).json();
      const d = j.daily || {}, byDate = {};
      (d.time || []).forEach((t, k) => { byDate[t] = k; });
      needPast.forEach(date => {
        const k = byDate[lastYear(date)];
        if (k == null || d.temperature_2m_max[k] == null) return;
        c.days[date] = { kind: "lastyear", code: d.weather_code[k], max: d.temperature_2m_max[k], min: d.temperature_2m_min[k], pop: null };
        changed = true;
      });
    }
    // 지난 날짜는 정리
    for (const k of Object.keys(c.days)) if (k < addDays(today, -7)) delete c.days[k];
    persist();
  } catch (e) { failedAt = Date.now(); }
  loading = false;
  if (changed && onDone) onDone();
}
