import { describe, expect, it } from "vitest";
import { clampOffset, clampZoom, coverScale, MAX_ZOOM, sourceRect, zoomAround } from "./crop";

// A 400 by 200 image in a 100px viewport: at zoom 1 it renders 200 by 100,
// so it can slide 50px either way horizontally and not at all vertically.
const W = 400;
const H = 200;
const V = 100;

describe("coverScale", () => {
  it("makes the shorter side fill the viewport", () => {
    expect(coverScale(W, H, V)).toBe(0.5);
    expect(coverScale(200, 400, V)).toBe(0.5);
    expect(coverScale(100, 100, V)).toBe(1);
  });
});

describe("clampZoom", () => {
  it("keeps zoom between 1 and MAX_ZOOM", () => {
    expect(clampZoom(0.2)).toBe(1);
    expect(clampZoom(2.5)).toBe(2.5);
    expect(clampZoom(9)).toBe(MAX_ZOOM);
  });
});

describe("clampOffset", () => {
  it("keeps every viewport pixel on the image", () => {
    expect(clampOffset({ x: 80, y: 10 }, W, H, V, 1)).toEqual({ x: 50, y: 0 });
    expect(clampOffset({ x: -80, y: -10 }, W, H, V, 1)).toEqual({ x: -50, y: 0 });
  });

  it("allows more travel when zoomed in", () => {
    // Zoom 2: 400 by 200 rendered, 150 and 50 of slack each way.
    expect(clampOffset({ x: 999, y: 999 }, W, H, V, 2)).toEqual({ x: 150, y: 50 });
  });
});

// The image pixel under a viewport point, for the invariant below.
function imagePointAt(
  point: { x: number; y: number },
  state: { zoom: number; offset: { x: number; y: number } },
) {
  const s = coverScale(W, H, V) * state.zoom;
  return { x: W / 2 + (point.x - state.offset.x) / s, y: H / 2 + (point.y - state.offset.y) / s };
}

describe("zoomAround", () => {
  const centred = { zoom: 1, offset: { x: 0, y: 0 } };

  it("zooming at the centre leaves the centre in place", () => {
    expect(zoomAround(centred, 2, { x: 0, y: 0 }, W, H, V)).toEqual({
      zoom: 2,
      offset: { x: 0, y: 0 },
    });
  });

  it("keeps the image point under the fingers fixed", () => {
    const point = { x: 20, y: -10 };
    const before = imagePointAt(point, centred);
    const after = zoomAround(centred, 1.5, point, W, H, V);
    expect(after.zoom).toBe(1.5);
    const afterPoint = imagePointAt(point, after);
    expect(afterPoint.x).toBeCloseTo(before.x);
    expect(afterPoint.y).toBeCloseTo(before.y);
  });

  it("clamps the zoom and then the offset", () => {
    const out = zoomAround({ zoom: 3.5, offset: { x: 0, y: 0 } }, 2, { x: 40, y: 40 }, W, H, V);
    expect(out.zoom).toBe(MAX_ZOOM);
    // Zoom 4: 800 by 400 rendered, 350 and 150 of slack.
    expect(Math.abs(out.offset.x)).toBeLessThanOrEqual(350);
    expect(Math.abs(out.offset.y)).toBeLessThanOrEqual(150);
  });

  it("zooming out past 1 stays at 1 and recentres as needed", () => {
    const out = zoomAround({ zoom: 1.2, offset: { x: 60, y: 10 } }, 0.5, { x: 0, y: 0 }, W, H, V);
    expect(out).toEqual({ zoom: 1, offset: { x: 50, y: 0 } });
  });
});

describe("sourceRect", () => {
  it("is the centre square at zoom 1 with no offset", () => {
    expect(sourceRect({ zoom: 1, offset: { x: 0, y: 0 } }, W, H, V)).toEqual({
      x: 100,
      y: 0,
      size: 200,
    });
  });

  it("moves the other way from the offset: image dragged right shows its left side", () => {
    expect(sourceRect({ zoom: 1, offset: { x: 50, y: 0 } }, W, H, V)).toEqual({
      x: 0,
      y: 0,
      size: 200,
    });
  });

  it("shrinks with zoom", () => {
    expect(sourceRect({ zoom: 2, offset: { x: 0, y: 0 } }, W, H, V)).toEqual({
      x: 150,
      y: 50,
      size: 100,
    });
  });
});
