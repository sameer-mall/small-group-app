// Where the top bar's Back pill goes. The app keeps the member's journey: the
// screens they passed through since they last tapped a tab. Back returns to
// the screen before this one, so a meeting opened from My notes goes back to
// My notes, and Settings goes back to whichever tab opened it.
//
// The journey is in memory only. After a cold launch (a notification, an
// invite link, a reload) it starts at the current screen, and Back falls back
// to that screen's parent instead.
//
// Pure, so the rules are unit tested without a browser. Browser-shipped: no
// zod, no db.

// The bottom bar's four screens. Each starts a fresh journey and shows the
// settings gear instead of Back.
const TAB_SCREENS = ["/", "/recipes", "/prayers", "/group"];

export function isTabScreen(path: string): boolean {
  return TAB_SCREENS.includes(path);
}

// The journey after the member arrives at `path`. Arriving at a screen already
// in the journey cuts back to that earlier visit. That is what makes Back skip
// a recipe form after a save redirects to the recipe, or a note that was just
// deleted, and it keeps two screens from bouncing Back between each other.
export function nextJourney(journey: string[], path: string): string[] {
  if (isTabScreen(path)) return [path];
  const earlier = journey.indexOf(path);
  if (earlier !== -1) return journey.slice(0, earlier + 1);
  return [...journey, path];
}

export type BackTarget = { href: string; label: string };

// Where Back goes from the journey's last screen: the one before it, or its
// parent when the journey starts here. Null on a tab screen.
export function backTarget(journey: string[]): BackTarget | null {
  const current = journey.at(-1);
  if (current === undefined || isTabScreen(current)) return null;
  const href = journey.at(-2) ?? parentOf(current);
  return { href, label: labelFor(href) };
}

function parentOf(path: string): string {
  if (/^\/recipes\/[^/]+\/edit$/.test(path)) return path.slice(0, -"/edit".length);
  if (path.startsWith("/recipes/")) return "/recipes";
  if (path.startsWith("/notes/")) return "/notes";
  if (path.startsWith("/settings/")) return "/settings";
  // Meetings, My notes, Settings, Create a group, and an invite link.
  return "/";
}

// The pill names the screen it lands on, like an iPhone app's back button.
const LABELS: Record<string, string> = {
  "/": "Meetings",
  "/recipes": "Recipes",
  "/prayers": "My prayers",
  "/group": "Group",
  "/notes": "My notes",
  "/settings": "Settings",
  "/settings/whats-new": "What's new",
};

function labelFor(path: string): string {
  if (LABELS[path]) return LABELS[path];
  if (/^\/meetings\/[^/]+$/.test(path)) return "Meeting";
  if (/^\/recipes\/[^/]+$/.test(path) && path !== "/recipes/new") return "Recipe";
  return "Back";
}
