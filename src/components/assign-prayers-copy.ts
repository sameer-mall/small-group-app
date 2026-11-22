// Pure copy for the prayer wall, kept apart so it can be unit tested.
import type { WallPerson } from "@/lib/prayers";

// The viewer reads as `label` ("You" leading a row, "you" mid-sentence),
// first in the list: "You, Sarah, Dan".
export function viewerFirst(people: WallPerson[], viewerId: string, label: string) {
  const others = people.filter((p) => p.userId !== viewerId).map((p) => p.name);
  return people.some((p) => p.userId === viewerId) ? [label, ...others] : others;
}

function list(names: string[]) {
  return names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

// "Waiting on you and Dan to post."
export function waitingCaption(writing: WallPerson[], viewerId: string) {
  return `Waiting on ${list(viewerFirst(writing, viewerId, "you"))} to post. Prayers can be assigned once everyone who's in has posted.`;
}

// The person assigning knows they haven't joined themselves, so the viewer is
// left out. Null when nobody else is left to mention.
export function notJoinedCallout(notJoined: WallPerson[], viewerId: string) {
  const names = notJoined.filter((p) => p.userId !== viewerId).map((p) => p.name);
  if (names.length === 0) return null;
  return `${list(names)} ${names.length === 1 ? "hasn't" : "haven't"} joined. They can still see the wall, but won't get a prayer this week.`;
}
