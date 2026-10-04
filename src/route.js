import { toastAction } from "./actions.js";
import { byId, km, save, state } from "./store.js";

// 동선 자동 정리: 첫 장소(보통 숙소·공항)는 그대로 두고, 나머지를 이동 거리가 가장 짧은 순서로
// 장소가 적어(보통 10곳 이하) 가까운 곳부터 고른 뒤 2-opt로 꼬인 경로를 풀면 충분히 좋은 답이 나옴

export const pathKm = pts => pts.slice(1).reduce((a, p, k) => a + km(pts[k], p), 0);

export function bestOrder(pts) {
  if (pts.length < 3) return pts.map((_, k) => k);
  // 1) 가까운 곳부터
  const left = new Set(pts.map((_, k) => k).slice(1)), order = [0];
  while (left.size) {
    const last = pts[order[order.length - 1]];
    let best = null, bd = Infinity;
    for (const k of left) { const d = km(last, pts[k]); if (d < bd) { bd = d; best = k; } }
    order.push(best); left.delete(best);
  }
  // 2) 2-opt: 구간을 뒤집어 짧아지면 계속 (첫 장소는 고정)
  const len = o => pathKm(o.map(k => pts[k]));
  let improved = true, cur = len(order);
  while (improved) {
    improved = false;
    for (let a = 1; a < order.length - 1; a++) for (let b = a + 1; b < order.length; b++) {
      const next = [...order.slice(0, a), ...order.slice(a, b + 1).reverse(), ...order.slice(b + 1)];
      const l = len(next);
      if (l < cur - 1e-9) { order.splice(0, order.length, ...next); cur = l; improved = true; }
    }
  }
  return order;
}

export function optimizeDay(i, after) {
  const d = state.days[i]; if (!d) return;
  const ids = d.stops.filter(id => byId(id)), pts = ids.map(byId);
  if (pts.length < 3) return;
  if (Object.keys(d.times || {}).some(id => ids.includes(id) && d.times[id]) && !confirm("방문 시간을 정해 둔 곳이 있어요. 시간과 상관없이 거리 순으로 정리할까요?")) return;
  const before = pathKm(pts), order = bestOrder(pts), after_ = pathKm(order.map(k => pts[k]));
  if (before - after_ < 0.05) return toastAction("이미 가장 짧은 순서예요", null);
  const prev = [...d.stops];
  d.stops = order.map(k => ids[k]);
  save(); after();
  toastAction(`이동 거리 ${before.toFixed(1)}km → ${after_.toFixed(1)}km`, "되돌리기", () => { d.stops = prev; save(); after(); });
}
