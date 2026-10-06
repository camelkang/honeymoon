import { test, expect, open } from "./fixtures.js";

// 지도는 평평한 기본 모양만: 기울이기·돌리기 없음, 건물 입체·지형 음영 끔
test("지도는 평평한 기본 스타일 (3D 건물·지형 음영 없음, 기울이기 불가)", async ({ page }) => {
  const empty = { type: "geojson", data: { type: "FeatureCollection", features: [] } };
  await page.route("**/tiles.openfreemap.org/styles/**", r => r.fulfill({ contentType: "application/json", body: JSON.stringify({
    version: 8, sources: { b: empty, r: { type: "raster", tiles: ["https://tiles.openfreemap.org/r/{z}/{x}/{y}.png"], tileSize: 256 } },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#e8e6df" } },
      { id: "building-3d", type: "fill-extrusion", source: "b", paint: { "fill-extrusion-height": 30, "fill-extrusion-base": 0 } },
      { id: "relief", type: "raster", source: "r", minzoom: 22 },   // 지형 음영 그림 (타일 요청 없게 아주 가까운 줌에서만)
    ],
  }) }));
  await open(page);
  const s = await page.evaluate(() => {
    const m = window.__map;
    m.setPitch(60); m.setBearing(45);
    return { pitch: m.getPitch(), maxPitch: m.getMaxPitch(), rotate: m.dragRotate.isEnabled(),
      h: m.getPaintProperty("building-3d", "fill-extrusion-height"), relief: m.getLayoutProperty("relief", "visibility") };
  });
  expect(s.pitch).toBe(0);
  expect(s.maxPitch).toBe(0);
  expect(s.rotate).toBe(false);
  expect(s.h).toBe(0);
  expect(s.relief).toBe("none");
  await expect(page.locator("#btnSettings")).toHaveCount(0);
});
