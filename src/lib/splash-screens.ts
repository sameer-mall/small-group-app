// iOS ignores the manifest when it launches an installed web app: no
// background_color, no icon, just a blank screen until the first page paints
// (seconds, on a cold start). It shows an apple-touch-startup-image instead,
// but only one whose media query matches the phone's screen exactly and whose
// file is that screen's exact pixel size. Hence one image per iPhone screen,
// in light and dark. Android builds its own splash from the manifest.
//
// scripts/generate-splash.mjs draws the files from this list into
// public/splash/; re-run it after changing the list or the colors.
// Plain types and `as const` only: Node runs this file as-is from that script.

// Portrait CSS pixels and device pixel ratio.
export const SPLASH_SCREENS = [
  { width: 440, height: 956, ratio: 3 }, // 16 Pro Max, 17 Pro Max
  { width: 420, height: 912, ratio: 3 }, // Air
  { width: 402, height: 874, ratio: 3 }, // 16 Pro, 17, 17 Pro
  { width: 430, height: 932, ratio: 3 }, // 14 Pro Max, 15 Plus, 15 Pro Max, 16 Plus
  { width: 393, height: 852, ratio: 3 }, // 14 Pro, 15, 15 Pro, 16
  { width: 428, height: 926, ratio: 3 }, // 12 Pro Max, 13 Pro Max, 14 Plus
  { width: 390, height: 844, ratio: 3 }, // 12, 12 Pro, 13, 13 Pro, 14, 16e
  { width: 375, height: 812, ratio: 3 }, // X, XS, 11 Pro, 12 mini, 13 mini
  { width: 414, height: 896, ratio: 3 }, // XS Max, 11 Pro Max
  { width: 414, height: 896, ratio: 2 }, // XR, 11
  { width: 414, height: 736, ratio: 3 }, // 6 Plus, 7 Plus, 8 Plus
  { width: 375, height: 667, ratio: 2 }, // 6, 7, 8, SE (2nd and 3rd gen)
  { width: 320, height: 568, ratio: 2 }, // SE (1st gen)
] as const;

// Hearth's --bg in each theme (docs/design/hearth/theme.css), so the splash
// hands off to the first page without a change of color.
export const SPLASH_BACKGROUND = { light: "#faf5ec", dark: "#201914" } as const;

export type SplashScreen = (typeof SPLASH_SCREENS)[number];
export type SplashTheme = keyof typeof SPLASH_BACKGROUND;

export function splashImagePath(screen: SplashScreen, theme: SplashTheme): string {
  return `/splash/${screen.width * screen.ratio}x${screen.height * screen.ratio}-${theme}.png`;
}

// For Next's metadata.appleWebApp.startupImage, which renders each as a
// <link rel="apple-touch-startup-image">. Both themes say so explicitly,
// rather than leaving light as the unconditional fallback, so which image
// iOS picks never depends on the order of the tags.
export function startupImages(): { url: string; media: string }[] {
  return SPLASH_SCREENS.flatMap((screen) =>
    (["light", "dark"] as const).map((theme) => ({
      url: splashImagePath(screen, theme),
      media:
        `screen and (device-width: ${screen.width}px) and (device-height: ${screen.height}px) and ` +
        `(-webkit-device-pixel-ratio: ${screen.ratio}) and (orientation: portrait) and ` +
        `(prefers-color-scheme: ${theme})`,
    })),
  );
}
