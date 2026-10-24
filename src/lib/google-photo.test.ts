import { describe, expect, it } from "vitest";
import { GOOGLE_PHOTO_SIZE, largeGooglePhoto } from "./google-photo";

const BASE = "https://lh3.googleusercontent.com/a/ACg8ocJx_abc123";
const LARGE = `${BASE}=s${GOOGLE_PHOTO_SIZE}-c`;

describe("largeGooglePhoto", () => {
  it("asks Google for a large copy instead of the 96px default", () => {
    expect(largeGooglePhoto(`${BASE}=s96-c`)).toBe(LARGE);
  });

  it("replaces other size options too", () => {
    expect(largeGooglePhoto(`${BASE}=s96`)).toBe(LARGE);
    expect(largeGooglePhoto(`${BASE}=w96-h96-c`)).toBe(LARGE);
  });

  it("adds a size when the URL has none", () => {
    expect(largeGooglePhoto(BASE)).toBe(LARGE);
  });

  it("is stable when run twice", () => {
    expect(largeGooglePhoto(largeGooglePhoto(`${BASE}=s96-c`))).toBe(LARGE);
  });

  it("leaves our own photos and other URLs alone", () => {
    const blob = "https://abc.public.blob.vercel-storage.com/avatars/u1/x.webp";
    const data = "data:image/webp;base64,AAAA";
    expect(largeGooglePhoto(blob)).toBe(blob);
    expect(largeGooglePhoto(data)).toBe(data);
    expect(largeGooglePhoto("not a url")).toBe("not a url");
    expect(largeGooglePhoto(null)).toBeNull();
  });
});
