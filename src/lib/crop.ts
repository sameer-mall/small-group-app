// Geometry for the crop dialog (src/components/crop-dialog.tsx). Pure, so the
// clamp and pinch rules are testable without a browser.
//
// Frame of reference: the viewport is a square of `viewport` px. `offset` is
// where the image's centre sits relative to the viewport's centre, in viewport
// px (positive x: image shifted right, so the viewport shows more of its left
// side). `zoom` is relative to the cover fit: at zoom 1 the image's shorter
// side exactly fills the viewport.

export type Offset = { x: number; y: number };
export type CropState = { zoom: number; offset: Offset };

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

function clamp(value: number, min: number, max: number): number {
  const clamped = Math.min(max, Math.max(min, value));
  // Math.min(0, -0) is -0, which prints as "0" but fails strict equality.
  return clamped === 0 ? 0 : clamped;
}

// Rendered px per image px at zoom 1.
export function coverScale(imageW: number, imageH: number, viewport: number): number {
  return viewport / Math.min(imageW, imageH);
}

export function clampZoom(zoom: number): number {
  return clamp(zoom, MIN_ZOOM, MAX_ZOOM);
}

// The image must cover the viewport: the centre can stray at most half the
// difference between the rendered size and the viewport, each way.
export function clampOffset(
  offset: Offset,
  imageW: number,
  imageH: number,
  viewport: number,
  zoom: number,
): Offset {
  const s = coverScale(imageW, imageH, viewport) * zoom;
  const maxX = (imageW * s - viewport) / 2;
  const maxY = (imageH * s - viewport) / 2;
  return { x: clamp(offset.x, -maxX, maxX), y: clamp(offset.y, -maxY, maxY) };
}

// Multiply the zoom by `factor` so that the image point under `point` stays
// under `point`: a pinch zooms around the fingers, a wheel around the cursor.
// With p the image point, point = offset + p * s before and
// point = offset' + p * s * k after, so offset' = point - (point - offset) * k.
export function zoomAround(
  state: CropState,
  factor: number,
  point: Offset,
  imageW: number,
  imageH: number,
  viewport: number,
): CropState {
  const zoom = clampZoom(state.zoom * factor);
  const k = zoom / state.zoom;
  const offset = {
    x: point.x - (point.x - state.offset.x) * k,
    y: point.y - (point.y - state.offset.y) * k,
  };
  return { zoom, offset: clampOffset(offset, imageW, imageH, viewport, zoom) };
}

// The square of the source image, in image px, that the viewport shows. This
// is what drawImage copies out.
export function sourceRect(
  state: CropState,
  imageW: number,
  imageH: number,
  viewport: number,
): { x: number; y: number; size: number } {
  const s = coverScale(imageW, imageH, viewport) * state.zoom;
  const size = viewport / s;
  const centreX = imageW / 2 - state.offset.x / s;
  const centreY = imageH / 2 - state.offset.y / s;
  return { x: centreX - size / 2, y: centreY - size / 2, size };
}
