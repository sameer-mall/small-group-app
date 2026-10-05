import { mkdir } from "node:fs/promises";
import sharp from "sharp";
import { SPLASH_BACKGROUND, SPLASH_SCREENS, splashImagePath } from "../src/lib/splash-screens.ts";

// Run with `node scripts/generate-splash.mjs`. Node 24 strips the types from
// splash-screens.ts on import; the MODULE_TYPELESS_PACKAGE_JSON warning it
// prints (package.json sets no "type") is harmless.

// The app icon, centered on Hearth's background: 128pt, the size of a large
// icon on an iOS launch screen.
const ICON_POINTS = 128;

await mkdir("public/splash", { recursive: true });
for (const screen of SPLASH_SCREENS) {
  const icon = await sharp("public/icons/icon-512.png")
    .resize(ICON_POINTS * screen.ratio)
    .toBuffer();
  for (const [theme, background] of Object.entries(SPLASH_BACKGROUND)) {
    await sharp({
      create: {
        width: screen.width * screen.ratio,
        height: screen.height * screen.ratio,
        channels: 3,
        background,
      },
    })
      .composite([{ input: icon, gravity: "center" }])
      .png({ compressionLevel: 9, palette: true })
      .toFile(`public${splashImagePath(screen, theme)}`);
  }
}
console.log(`splash screens written (${SPLASH_SCREENS.length * 2})`);
