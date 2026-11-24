import { describe, expect, it } from "vitest";
import { notJoinedCallout, waitingCaption } from "./assign-prayers-copy";

const me = { userId: "me", name: "Sam" };
const dan = { userId: "dan", name: "Dan" };
const ruth = { userId: "ruth", name: "Ruth" };
const tail = "Prayers can be assigned once everyone who's in has posted.";
const joinedTail = "They can still see the wall, but won't get a prayer this week.";

describe("notJoinedCallout", () => {
  it("shows nothing when the viewer is the only one not joined", () => {
    expect(notJoinedCallout([me], "me")).toBeNull();
    expect(notJoinedCallout([], "me")).toBeNull();
  });
  it("leaves the viewer out when others haven't joined either", () => {
    expect(notJoinedCallout([me, dan], "me")).toBe(`Dan hasn't joined. ${joinedTail}`);
  });
  it("names others only, with a plural verb for two or more", () => {
    expect(notJoinedCallout([dan], "me")).toBe(`Dan hasn't joined. ${joinedTail}`);
    expect(notJoinedCallout([dan, ruth], "me")).toBe(`Dan and Ruth haven't joined. ${joinedTail}`);
    expect(notJoinedCallout([me, dan, ruth], "me")).toBe(`Dan and Ruth haven't joined. ${joinedTail}`);
  });
});

describe("waitingCaption", () => {
  it("says lowercase 'you' for a viewer who is the only one writing", () => {
    expect(waitingCaption([me], "me")).toBe(`Waiting on you to post. ${tail}`);
  });
  it("puts the viewer first, lowercase, with one other", () => {
    expect(waitingCaption([dan, me], "me")).toBe(`Waiting on you and Dan to post. ${tail}`);
  });
  it("names others only when the viewer isn't writing", () => {
    expect(waitingCaption([dan], "me")).toBe(`Waiting on Dan to post. ${tail}`);
    expect(waitingCaption([dan, ruth], "me")).toBe(`Waiting on Dan and Ruth to post. ${tail}`);
  });
  it("uses a serial comma for three", () => {
    expect(waitingCaption([dan, me, ruth], "me")).toBe(`Waiting on you, Dan, and Ruth to post. ${tail}`);
  });
});
