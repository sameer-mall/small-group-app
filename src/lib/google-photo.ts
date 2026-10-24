// Google sign-in hands over a profile photo URL that asks for a 96px copy
// (`...=s96-c`). The Settings card shows the photo edge to edge, so 96px
// looks blocky there. Google serves any size from the same URL, so ask for
// GOOGLE_PHOTO_SIZE instead, matching the photos members upload
// (AVATAR_SIZE in src/lib/avatars.ts). Anything that isn't a Google photo URL
// comes back unchanged. No imports: <Avatar> runs this in the browser.

export const GOOGLE_PHOTO_SIZE = 1024;

// The size option at the end of the URL: `=s96-c`, `=s96`, `=w96-h96-c`, ...
const SIZE_OPTION = /=[swh]\d+(-[a-z0-9]+)*$/i;

export function largeGooglePhoto(url: string): string;
export function largeGooglePhoto(url: string | null): string | null;
export function largeGooglePhoto(url: string | null): string | null {
  if (!url) return url;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (!parsed.hostname.endsWith(".googleusercontent.com")) return url;
  const sized = `=s${GOOGLE_PHOTO_SIZE}-c`;
  return SIZE_OPTION.test(url) ? url.replace(SIZE_OPTION, sized) : `${url}${sized}`;
}
