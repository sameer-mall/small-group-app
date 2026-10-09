// What's new: the release notes members see once in a popup after a release,
// and any time from the Settings screen. Hand-written, one entry per change a
// member would notice, added in the same PR as the change (CLAUDE.md).
//
// Each member's user row records the highest id they've dismissed
// (user.whats_new_seen), so ids decide what's unseen; dates are for display
// only. New entries go at the TOP with the next id. Never reuse or renumber an
// id. Rewording a shipped entry is fine and won't show it again.
//
// Pure data and logic: no database or server imports, so the layout, the
// list page and tests can all read it.

export type Release = {
  id: number;
  // YYYY-MM-DD, shown as a calendar date with no timezone conversion.
  date: string;
  title: string;
  // One or two sentences, written for members. No em dashes.
  body: string;
};

export const releases: Release[] = [
  {
    id: 5,
    date: "2026-10-09",
    title: "Back buttons, and a Settings tab",
    body: "Tap Back at the top of a screen to return to where you were, like from My notes to your meeting. Settings now has its own tab at the bottom of the screen.",
  },
  {
    id: 4,
    date: "2026-10-08",
    title: "Notifications, and a Settings screen",
    body: "Open Settings to turn on notifications and hear when a meeting, meal, or recipe is added. Your name, appearance, and What's new live there now too.",
  },
  {
    id: 3,
    date: "2026-10-05",
    title: "The prayer bowl waits for everyone",
    body: "The bowl can't be drawn until everyone who's in has written a request. Joined by mistake? Tap I'm out to leave the bowl.",
  },
  {
    id: 2,
    date: "2026-10-05",
    title: "Change your name anytime",
    body: "Made a typo when you signed up? Tap Edit name under Settings to change how your name shows to your group.",
  },
  {
    id: 1,
    date: "2026-10-05",
    title: "Smoother on iPhone",
    body: "The app opens to a splash screen instead of a black screen, and buttons, dialogs, and date fields fit small screens better.",
  },
];

export const LATEST_RELEASE_ID = releases[0].id;

// The popup lists this many at most; the rest are a tap away on the list page.
export const POPUP_LIMIT = 3;

// The entries newer than the last one a member dismissed, newest first.
export function unseenReleases(seen: number, list: Release[] = releases): Release[] {
  return list.filter((release) => release.id > seen);
}

// What the popup gets: the newest few unseen entries, the id to record as
// seen when it closes (0 when there's nothing to show), and whether more
// unseen entries wait on the list page.
export function whatsNewPopup(seen: number, list: Release[] = releases) {
  const unseen = unseenReleases(seen, list);
  return {
    releases: unseen.slice(0, POPUP_LIMIT),
    newestId: unseen[0]?.id ?? 0,
    hasMore: unseen.length > POPUP_LIMIT,
  };
}
