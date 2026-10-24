"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  clampOffset,
  coverScale,
  MAX_ZOOM,
  MIN_ZOOM,
  sourceRect,
  zoomAround,
  type CropState,
  type Offset,
} from "@/lib/crop";

// Pixels in the JPEG handed back: the stored size (AVATAR_SIZE in
// src/lib/avatars.ts). Any bigger and a detailed photo can pass the 1 MB
// upload limit (MAX_UPLOAD_BYTES there).
export const CROP_OUTPUT_SIZE = 1024;
// The square the member frames their face in. Fits the dialog on a 375px
// phone (375 minus 2 x 16 margin minus 2 x 16 padding leaves 311).
const VIEWPORT = 280;

const INITIAL: CropState = { zoom: 1, offset: { x: 0, y: 0 } };

type Size = { w: number; h: number };
type Pointer = { x: number; y: number };

function distance(a: Pointer, b: Pointer) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Pointer, b: Pointer): Pointer {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

type Handlers = {
  onCancel: () => void;
  onCrop: (photo: Blob) => void;
  onUnreadable: () => void;
};

// Frame a photo inside a circle by dragging and pinching (or the slider and
// the wheel on a desktop), then hand back the framed square as a JPEG. `src`
// is an object URL the caller owns; the dialog is open while it is set.
// Geometry lives in src/lib/crop.ts; this file is the wiring.
export function CropDialog({ src, ...handlers }: { src: string | null } & Handlers) {
  return (
    <Dialog open={src !== null} onOpenChange={(open) => !open && handlers.onCancel()}>
      <DialogContent showCloseButton={false}>
        {/* Keyed by src: a new photo gets fresh framing state. */}
        {src && <Cropper key={src} src={src} {...handlers} />}
      </DialogContent>
    </Dialog>
  );
}

function Cropper({ src, onCancel, onCrop, onUnreadable }: { src: string } & Handlers) {
  const [size, setSize] = useState<Size | null>(null);
  const [state, setState] = useState<CropState>(INITIAL);
  const [exporting, setExporting] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  // Every pointer currently down on the viewport, by pointerId.
  const pointers = useRef(new Map<number, Pointer>());

  // React registers wheel listeners as passive, so preventDefault (which
  // stops the page behind the dialog from scrolling) needs a native one.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !size) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const point = {
        x: e.clientX - rect.left - VIEWPORT / 2,
        y: e.clientY - rect.top - VIEWPORT / 2,
      };
      const factor = Math.exp(-e.deltaY * 0.002);
      setState((s) => zoomAround(s, factor, point, size.w, size.h, VIEWPORT));
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, [size]);

  // Pointer positions relative to the viewport's centre, the frame
  // src/lib/crop.ts works in.
  function localPoint(e: React.PointerEvent): Pointer {
    const rect = viewportRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left - VIEWPORT / 2, y: e.clientY - rect.top - VIEWPORT / 2 };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!size) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, localPoint(e));
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!size) return;
    const previous = pointers.current.get(e.pointerId);
    if (!previous) return;
    const current = localPoint(e);
    const others = [...pointers.current.entries()].filter(([id]) => id !== e.pointerId);
    pointers.current.set(e.pointerId, current);

    if (others.length === 0) {
      // One finger: drag.
      setState((s) => ({
        zoom: s.zoom,
        offset: clampOffset(
          { x: s.offset.x + current.x - previous.x, y: s.offset.y + current.y - previous.y },
          size.w,
          size.h,
          VIEWPORT,
          s.zoom,
        ),
      }));
      return;
    }

    // Two fingers: zoom by how much they spread, around their midpoint, and
    // pan by how much the midpoint moved. (A third finger is ignored.)
    const [, other] = others[0];
    const before = { distance: distance(previous, other), mid: midpoint(previous, other) };
    const after = { distance: distance(current, other), mid: midpoint(current, other) };
    if (before.distance === 0) return;
    setState((s) => {
      const zoomed = zoomAround(
        s,
        after.distance / before.distance,
        before.mid,
        size.w,
        size.h,
        VIEWPORT,
      );
      const panned: Offset = {
        x: zoomed.offset.x + after.mid.x - before.mid.x,
        y: zoomed.offset.y + after.mid.y - before.mid.y,
      };
      return {
        zoom: zoomed.zoom,
        offset: clampOffset(panned, size.w, size.h, VIEWPORT, zoomed.zoom),
      };
    });
  }

  function onPointerEnd(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
  }

  function onSlider(e: React.ChangeEvent<HTMLInputElement>) {
    if (!size) return;
    const zoom = Number(e.target.value);
    setState((s) => zoomAround(s, zoom / s.zoom, { x: 0, y: 0 }, size.w, size.h, VIEWPORT));
  }

  async function confirm() {
    const img = imgRef.current;
    if (!img || !size) return;
    setExporting(true);
    try {
      const rect = sourceRect(state, size.w, size.h, VIEWPORT);
      const canvas = document.createElement("canvas");
      canvas.width = CROP_OUTPUT_SIZE;
      canvas.height = CROP_OUTPUT_SIZE;
      const context = canvas.getContext("2d");
      if (!context) {
        onUnreadable();
        return;
      }
      context.drawImage(
        img,
        rect.x,
        rect.y,
        rect.size,
        rect.size,
        0,
        0,
        CROP_OUTPUT_SIZE,
        CROP_OUTPUT_SIZE,
      );
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/jpeg", 0.9),
      );
      if (!blob) {
        onUnreadable();
        return;
      }
      onCrop(blob);
    } finally {
      setExporting(false);
    }
  }

  const scale = size ? coverScale(size.w, size.h, VIEWPORT) * state.zoom : 1;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="font-serif text-xl font-semibold">Frame your photo</DialogTitle>
        <DialogDescription>Drag to move. Pinch or use the slider to zoom.</DialogDescription>
      </DialogHeader>

      {/* touch-action: none keeps the browser from scrolling or zooming the
          page while a finger is on the photo. The dark ring is a circle with
          an enormous shadow: everything outside it is what gets cut. */}
      <div
        ref={viewportRef}
        data-testid="crop-viewport"
        className="bg-muted relative mx-auto touch-none overflow-hidden rounded-xl select-none"
        style={{ width: VIEWPORT, height: VIEWPORT }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        {/* A blob: URL for a file the member just picked; nothing for
            next/image to optimize. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={src}
          alt=""
          draggable={false}
          onLoad={(e) => {
            const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
            if (w === 0 || h === 0) onUnreadable();
            else setSize({ w, h });
          }}
          onError={onUnreadable}
          className="pointer-events-none absolute top-1/2 left-1/2 h-auto max-w-none"
          style={
            size
              ? {
                  width: size.w * scale,
                  height: size.h * scale,
                  transform: `translate(calc(-50% + ${state.offset.x}px), calc(-50% + ${state.offset.y}px))`,
                }
              : { visibility: "hidden" }
          }
        />
        <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_999px_rgba(0,0,0,0.45)]" />
      </div>

      <label className="flex items-center gap-3 text-sm">
        <span className="text-muted-foreground">Zoom</span>
        <input
          type="range"
          min={MIN_ZOOM}
          max={MAX_ZOOM}
          step={0.01}
          value={state.zoom}
          onChange={onSlider}
          disabled={!size}
          className="accent-primary flex-1"
        />
      </label>

      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" className="flex-1" onClick={confirm} disabled={!size || exporting}>
          Use photo
        </Button>
      </div>
    </>
  );
}
