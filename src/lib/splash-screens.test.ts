import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { SPLASH_BACKGROUND, SPLASH_SCREENS, startupImages } from "./splash-screens";

// iOS shows a startup image only when its media query matches the phone
// exactly, and then only if the file is that screen's exact pixel size. A
// wrong size or a missing file shows the blank screen this is meant to hide,
// with no error anywhere, so check every one.
const images = startupImages();

describe("startupImages", () => {
  it("has a light and a dark image for every screen", () => {
    expect(images).toHaveLength(SPLASH_SCREENS.length * 2);
    for (const theme of ["light", "dark"] as const) {
      const forTheme = images.filter((image) =>
        image.media.endsWith(`(prefers-color-scheme: ${theme})`),
      );
      expect(forTheme).toHaveLength(SPLASH_SCREENS.length);
    }
  });

  it("covers the iPhone Pro Max screen (440x956 at 3x)", () => {
    expect(images.map((image) => image.media)).toContain(
      "screen and (device-width: 440px) and (device-height: 956px) and " +
        "(-webkit-device-pixel-ratio: 3) and (orientation: portrait) and " +
        "(prefers-color-scheme: dark)",
    );
  });

  it.each(images)("$url is the screen's exact size in its theme's background", async (image) => {
    const [, width, height, ratio] = image.media.match(
      /device-width: (\d+)px\) and \(device-height: (\d+)px\) and \(-webkit-device-pixel-ratio: (\d)\)/,
    )!.map(Number);
    const theme = image.media.endsWith("(prefers-color-scheme: dark)") ? "dark" : "light";

    const file = sharp(path.join("public", image.url));
    const { width: fileWidth, height: fileHeight } = await file.metadata();
    expect([fileWidth, fileHeight]).toEqual([width * ratio, height * ratio]);

    const corner = await file.clone().extract({ left: 0, top: 0, width: 1, height: 1 }).raw().toBuffer();
    const hex = `#${[...corner.subarray(0, 3)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
    expect(hex).toBe(SPLASH_BACKGROUND[theme]);
  });
});
