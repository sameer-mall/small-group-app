import { describe, expect, it } from "vitest";
import { backTarget, isTabScreen, nextJourney } from "@/lib/journey";

// Walks a member through screens the way the top bar sees them.
function walk(...paths: string[]): string[] {
  return paths.reduce<string[]>((journey, path) => nextJourney(journey, path), []);
}

describe("isTabScreen", () => {
  it("is true for the five tab screens only", () => {
    expect(["/", "/recipes", "/prayers", "/group", "/settings"].every(isTabScreen)).toBe(true);
    expect(["/meetings/m1", "/recipes/r1", "/notes", "/settings/whats-new"].some(isTabScreen)).toBe(
      false,
    );
  });
});

describe("nextJourney", () => {
  it("starts afresh on a tab screen", () => {
    expect(walk("/", "/meetings/m1", "/recipes")).toEqual(["/recipes"]);
  });

  it("adds a screen the member moves forward to", () => {
    expect(walk("/", "/meetings/m1", "/notes")).toEqual(["/", "/meetings/m1", "/notes"]);
  });

  it("cuts back to an earlier visit of the same screen", () => {
    expect(walk("/", "/meetings/m1", "/notes", "/meetings/m1")).toEqual(["/", "/meetings/m1"]);
  });

  it("drops a saved form: edit, save, and Back skips the form", () => {
    const journey = walk("/recipes", "/recipes/r1", "/recipes/r1/edit", "/recipes/r1");
    expect(journey).toEqual(["/recipes", "/recipes/r1"]);
  });

  it("drops a deleted note: Back from My notes skips it", () => {
    const journey = walk("/", "/meetings/m1", "/notes", "/notes/n1", "/notes");
    expect(journey).toEqual(["/", "/meetings/m1", "/notes"]);
  });

  it("starts from the first screen it sees", () => {
    expect(walk("/meetings/m1")).toEqual(["/meetings/m1"]);
  });
});

describe("backTarget", () => {
  it("is null on a tab screen", () => {
    expect(backTarget(walk("/"))).toBeNull();
    expect(backTarget(walk("/", "/meetings/m1", "/group"))).toBeNull();
    expect(backTarget(walk("/recipes", "/settings"))).toBeNull();
  });

  it("goes to the screen before, named for where it lands", () => {
    expect(backTarget(walk("/", "/meetings/m1"))).toEqual({ href: "/", label: "Meetings" });
    expect(backTarget(walk("/", "/meetings/m1", "/notes"))).toEqual({
      href: "/meetings/m1",
      label: "Meeting",
    });
    expect(backTarget(walk("/settings", "/settings/whats-new"))).toEqual({
      href: "/settings",
      label: "Settings",
    });
  });

  it("returns to wherever the What's new popup was opened", () => {
    const journey = walk("/", "/meetings/m1", "/settings/whats-new");
    expect(backTarget(journey)).toEqual({ href: "/meetings/m1", label: "Meeting" });
  });

  it("returns to the meeting My notes was opened from, after a deleted note", () => {
    const journey = walk("/", "/meetings/m1", "/notes", "/notes/n1", "/notes");
    expect(backTarget(journey)).toEqual({ href: "/meetings/m1", label: "Meeting" });
  });

  it("falls back to each screen's parent when the journey starts there", () => {
    const parents: Record<string, string> = {
      "/meetings/m1": "/",
      "/recipes/r1": "/recipes",
      "/recipes/new": "/recipes",
      "/recipes/r1/edit": "/recipes/r1",
      "/notes": "/",
      "/notes/n1": "/notes",
      "/settings/whats-new": "/settings",
      "/create-group": "/",
      "/join/abc123": "/",
    };
    for (const [path, parent] of Object.entries(parents)) {
      expect(backTarget(walk(path))?.href, path).toBe(parent);
    }
  });

  it("says Back when the screen before has no short name", () => {
    expect(backTarget(walk("/recipes", "/recipes/r1", "/recipes/r1/edit", "/settings/whats-new"))).toEqual({
      href: "/recipes/r1/edit",
      label: "Back",
    });
  });
});
