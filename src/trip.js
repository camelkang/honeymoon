import { allCities, app, isoAdd, normalizePlan } from "./store.js";

// 여러 도시 여행 일정표: 전체 기간 + 기본 도시 + 다른 도시에 머무는 날
// 예) 11/15~11/24 시드니, 그중 11/17~11/19는 케언즈 → 시드니 일정은 15·16·20~24일, 케언즈 일정은 17~19일
// app.trip = { start, end, base, stops: [{ city, from, to }] }

// 아래 함수들은 저장된 일정표(app.trip) 기준, 편집 중인 초안을 넘기면 그걸로 계산
export const validTrip = t => !!(t && t.start && t.end && t.base && t.end >= t.start);
export const hasTrip = () => validTrip(app.trip);
export function tripDates(t = app.trip) {
  if (!validTrip(t)) return [];
  const out = [];
  for (let d = t.start; d <= t.end && out.length < 90; d = isoAdd(d, 1)) out.push(d);
  return out;
}
// 그날 머무는 도시 (나중에 적은 구간이 우선)
export function cityOf(date, t = app.trip) {
  if (!t) return null;
  let city = t.base;
  for (const s of t.stops || []) if (s.city && s.from && s.to && s.from <= date && date <= s.to) city = s.city;
  return city;
}
// 연속된 구간: [{ city, from, to, n }]
export function segments(t = app.trip) {
  const out = [];
  for (const d of tripDates(t)) {
    const c = cityOf(d, t), last = out[out.length - 1];
    if (last && last.city === c) { last.to = d; last.n++; } else out.push({ city: c, from: d, to: d, n: 1 });
  }
  return out;
}
export const tripCities = () => [...new Set(segments().map(s => s.city))].filter(c => allCities()[c]);
export const cityRanges = city => segments().filter(s => s.city === city);
export const tripDayNo = date => { const k = tripDates().indexOf(date); return k < 0 ? null : k + 1; };
export const inTrip = date => hasTrip() && date >= app.trip.start && date <= app.trip.end;

// 일정표에 맞춰 도시별 날짜 칸을 다시 만듦. 같은 날짜에 쓴 내용은 그대로, 날짜가 없던 기존 칸은 앞에서부터 채워 넣음
export function applyTrip() {
  const cities = new Set(tripCities());
  for (const [id, plan] of Object.entries(app.plans)) {
    if (cities.has(id) || !plan.days.some(d => "date" in d)) continue;
    // 일정표에서 빠진 도시: 날짜 표시만 거두고 내용은 남김
    const first = plan.days.find(d => d.date);
    if (first) plan.startDate = first.date;
    plan.days.forEach(d => { delete d.date; });
  }
  if (!hasTrip()) return;
  for (const city of cities) {
    // 지금 보고 있는 도시의 계획 객체는 화면이 참조하고 있으니 바꿔 끼우지 않고 그 안을 고침
    let plan = app.plans[city];
    if (!plan || !Array.isArray(plan.days)) plan = app.plans[city] = normalizePlan(plan);
    const dates = tripDates().filter(d => cityOf(d) === city);
    const old = plan.days, used = new Set();
    const byDate = new Map(old.filter(d => d.date).map(d => [d.date, d]));
    const undated = old.filter(d => !d.date);
    const days = dates.map(date => {
      let d = byDate.get(date);
      if (!d) d = undated.find(x => !used.has(x));
      if (!d) d = { stops: [], note: "", times: {} };
      used.add(d);
      return { ...d, date };
    });
    // 일정표 밖으로 밀려난 날 중 내용이 있는 것은 "날짜 미정"으로 남김
    for (const d of old) if (!used.has(d) && (d.stops.length || d.note)) days.push({ ...d, date: "" });
    plan.days = days;
    plan.startDate = dates[0] || plan.startDate;
    if (plan.focusDay !== null && plan.focusDay >= days.length) plan.focusDay = null;
  }
}
