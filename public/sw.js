// 둘이서 서비스 워커: 앱 화면은 오프라인에서도 열리고, 본 지도(OpenFreeMap 스타일·타일·글꼴)는 캐시해 둠
const VERSION = "v5";
const SHELL = `shell-${VERSION}`;
const TILES = "tiles-v2";
const SHELL_FILES = [
  "./", "./index.html", "./manifest.webmanifest", "./icons/icon.svg", "./icons/icon-192.png",
];  // 빌드된 JS·CSS(assets/)는 처음 받을 때 캐시됨
const TILE_HOSTS = /tiles\.openfreemap\.org/;
const MAX_TILES = 1500;

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== TILES && !k.startsWith("offline-")).map(k => caches.delete(k))))   // 미리 저장한 지도(offline-)는 남김
    .then(() => self.clients.claim()));
});

let puts = 0;
async function trimTiles() {
  const c = await caches.open(TILES), keys = await c.keys();
  for (const k of keys.slice(0, Math.max(0, keys.length - MAX_TILES))) await c.delete(k);
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // 앱 화면: 네트워크 우선(항상 최신), 오프라인이면 캐시
  if (url.origin === location.origin) {
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("./index.html"))));
    return;
  }
  // 기본 지도 타일: 캐시 우선 + 백그라운드 저장 (본 적 있는 지역은 오프라인에서도 보임)
  if (TILE_HOSTS.test(url.hostname)) {
    // 미리 저장한 지도(offline-*)부터 찾고, 없으면 최근 본 타일 캐시 → 네트워크
    e.respondWith(caches.open(TILES).then(c => caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === "opaque") { c.put(req, res.clone()); if (++puts % 100 === 0) trimTiles(); }
      return res;
    }))));
  }
  // 구글 지도·API 요청은 그대로 통과 (캐시 금지)
});
