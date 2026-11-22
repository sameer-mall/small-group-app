// Pure copy for the Assign prayers button, kept apart so it can be unit tested.
type Person = { userId: string; name: string };

function list(names: string[]) {
  return names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
}

// Mid-sentence the viewer reads as lowercase "you", first in the list:
// "Waiting on you and Dan to post."
export function waitingCaption(writing: Person[], viewerId: string) {
  const mine = writing.some((p) => p.userId === viewerId);
  const others = writing.filter((p) => p.userId !== viewerId).map((p) => p.name);
  const names = mine ? ["you", ...others] : others;
  return `Waiting on ${list(names)} to post. Prayers can be assigned once everyone who's in has posted.`;
}

// The person assigning knows they haven't joined themselves, so the viewer is
// left out. Null when nobody else is left to mention.
export function notJoinedCallout(notJoined: Person[], viewerId: string) {
  const names = notJoined.filter((p) => p.userId !== viewerId).map((p) => p.name);
  if (names.length === 0) return null;
  return `${list(names)} ${names.length === 1 ? "hasn't" : "haven't"} joined. They can still see the wall, but won't get a prayer this week.`;
}
