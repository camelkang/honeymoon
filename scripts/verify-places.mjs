// 추천 장소 좌표를 OpenStreetMap(Nominatim)으로 찾은 위치와 비교해, 멀리 떨어진 곳을 알려줌
// 사용: node scripts/verify-places.mjs [도시id ...]   (Nominatim 정책상 1초에 1건씩)
import { CITIES } from "../src/data.js";

const only = process.argv.slice(2);
const LIMIT_KM = 1.5;
const km = (a, b) => {
  const R = 6371, r = x => x * Math.PI / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function geocode(q, near) {
  const u = new URL("https://nominatim.openstreetmap.org/search");
  // 도시 주변(±1.5도)으로 범위를 좁혀 동명이인 장소를 피함
  u.search = new URLSearchParams({ q, format: "json", limit: "1",
    viewbox: [near.lng - 1.5, near.lat + 1.5, near.lng + 1.5, near.lat - 1.5].join(","), bounded: "1" });
  const r = await fetch(u, { headers: { "User-Agent": "duriseo-place-check/1.0 (github.com/camelkang/honeymoon)" } });
  const j = await r.json();
  return j[0] ? { lat: +j[0].lat, lng: +j[0].lon, name: j[0].display_name } : null;
}

const bad = [], missing = [];
let n = 0;
for (const c of Object.values(CITIES)) {
  if (only.length && !only.includes(c.id)) continue;
  for (const p of c.places) {
    if (!p.en) continue;
    let g = await geocode(p.en, c.center); await sleep(1100);
    if (!g) { g = await geocode(`${p.en}, ${c.suffix}`, c.center); await sleep(1100); }
    n++;
    if (!g) { missing.push(`${c.id}\t${p.id}\t${p.en}`); continue; }
    const d = km(p, g);
    const line = `${c.id}\t${p.id}\t${d.toFixed(2)}km\t${p.en}\tOSM ${g.lat.toFixed(4)},${g.lng.toFixed(4)}\t${g.name.slice(0, 80)}`;
    console.log((d > LIMIT_KM ? "FAR  " : "ok   ") + line);
    if (d > LIMIT_KM) bad.push(line);
  }
}
console.log(`\n확인 ${n}곳 · ${LIMIT_KM}km 넘게 차이 ${bad.length}곳 · 못 찾음 ${missing.length}곳`);
if (bad.length) console.log("\n## 멀리 떨어진 곳\n" + bad.join("\n"));
if (missing.length) console.log("\n## OSM에서 못 찾은 곳 (직접 확인)\n" + missing.join("\n"));
