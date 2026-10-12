import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { AVATAR_SIZE, avatarForm, processAvatar } from "./avatars";

type Rgb = { r: number; g: number; b: number };
const RED: Rgb = { r: 220, g: 40, b: 40 };
const BLUE: Rgb = { r: 40, g: 60, b: 220 };

// 300 wide, 200 tall: red left half, blue right half.
async function redBlueJpeg(orientation?: number) {
  const left = await sharp({ create: { width: 150, height: 200, channels: 3, background: RED } })
    .png()
    .toBuffer();
  const image = sharp({
    create: { width: 300, height: 200, channels: 3, background: BLUE },
  }).composite([{ input: left, left: 0, top: 0 }]);
  return (orientation ? image.withMetadata({ orientation }) : image).jpeg().toBuffer();
}

async function pixel(webp: Buffer, x: number, y: number): Promise<Rgb> {
  const { data } = await sharp(webp).raw().toBuffer({ resolveWithObject: true });
  const i = (y * AVATAR_SIZE + x) * 3;
  return { r: data[i], g: data[i + 1], b: data[i + 2] };
}

const near = (a: Rgb, b: Rgb) =>
  Math.abs(a.r - b.r) < 20 && Math.abs(a.g - b.g) < 20 && Math.abs(a.b - b.b) < 20;

describe("processAvatar", () => {
  it("produces a square WebP of AVATAR_SIZE with no metadata", async () => {
    const out = await processAvatar(await redBlueJpeg());
    const meta = await sharp(out).metadata();
    expect(meta.format).toBe("webp");
    expect([meta.width, meta.height]).toEqual([AVATAR_SIZE, AVATAR_SIZE]);
    expect(meta.exif).toBeUndefined();
    expect(meta.orientation).toBeUndefined();
  });

  it("crops to the centre, keeping both halves", async () => {
    const out = await processAvatar(await redBlueJpeg());
    expect(near(await pixel(out, 10, 128), RED)).toBe(true);
    expect(near(await pixel(out, 245, 128), BLUE)).toBe(true);
  });

  it("applies the EXIF orientation before cropping", async () => {
    // Orientation 6 means "rotate 90 degrees clockwise to display": the left
    // (red) half becomes the top.
    const out = await processAvatar(await redBlueJpeg(6));
    expect(near(await pixel(out, 128, 10), RED)).toBe(true);
    expect(near(await pixel(out, 128, 245), BLUE)).toBe(true);
  });

  it("refuses bytes that are not an image", async () => {
    await expect(processAvatar(Buffer.from("not an image at all"))).rejects.toThrow(
      "unreadable-image",
    );
  });
});

describe("avatarForm", () => {
  it("accepts a small file and refuses an empty or missing one", () => {
    const ok = new File([new Uint8Array(10)], "avatar.jpg", { type: "image/jpeg" });
    expect(avatarForm.safeParse({ photo: ok }).success).toBe(true);
    const empty = new File([], "avatar.jpg", { type: "image/jpeg" });
    expect(avatarForm.safeParse({ photo: empty }).success).toBe(false);
    expect(avatarForm.safeParse({ photo: "avatar.jpg" }).success).toBe(false);
    expect(avatarForm.safeParse({}).success).toBe(false);
  });
});
