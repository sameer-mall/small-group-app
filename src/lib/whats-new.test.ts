import { describe, expect, it } from "vitest";
import {
  LATEST_RELEASE_ID,
  POPUP_LIMIT,
  releases,
  unseenReleases,
  whatsNewPopup,
  type Release,
} from "@/lib/whats-new";

const entry = (id: number): Release => ({
  id,
  date: "2026-10-05",
  title: `Entry ${id}`,
  body: `Body ${id}`,
});

// Newest first, as in the real list.
const LIST = [entry(5), entry(4), entry(3), entry(2), entry(1)];

describe("unseenReleases", () => {
  it("returns every entry, newest first, to someone who has seen none", () => {
    expect(unseenReleases(0, LIST).map((r) => r.id)).toEqual([5, 4, 3, 2, 1]);
  });

  it("returns only the entries newer than the last one seen", () => {
    expect(unseenReleases(3, LIST).map((r) => r.id)).toEqual([5, 4]);
  });

  it("returns nothing to someone who is caught up", () => {
    expect(unseenReleases(5, LIST)).toEqual([]);
  });

  it("returns nothing when seen is past the newest entry (a rolled-back deploy)", () => {
    expect(unseenReleases(9, LIST)).toEqual([]);
  });

  it("reads the real list by default", () => {
    expect(unseenReleases(0)).toEqual(releases);
  });
});

describe("whatsNewPopup", () => {
  it("shows the newest few and points to the rest when more are unseen", () => {
    const popup = whatsNewPopup(0, LIST);
    expect(POPUP_LIMIT).toBe(3);
    expect(popup.releases.map((r) => r.id)).toEqual([5, 4, 3]);
    expect(popup.newestId).toBe(5);
    expect(popup.hasMore).toBe(true);
  });

  it("shows everything unseen, with no pointer, when it fits", () => {
    const popup = whatsNewPopup(2, LIST);
    expect(popup.releases.map((r) => r.id)).toEqual([5, 4, 3]);
    expect(popup.hasMore).toBe(false);
  });

  it("is empty for someone caught up", () => {
    expect(whatsNewPopup(5, LIST)).toEqual({ releases: [], newestId: 0, hasMore: false });
  });
});

// The entries are hand-written in every user-facing PR, so the mechanical
// rules from the design spec are checked here rather than in review.
describe("release notes content", () => {
  it("numbers entries with unique positive integers, newest (highest) first", () => {
    for (const { id } of releases) {
      expect(Number.isInteger(id) && id > 0, `id ${id}`).toBe(true);
    }
    for (let i = 1; i < releases.length; i++) {
      expect(releases[i].id, `entry after id ${releases[i - 1].id}`).toBeLessThan(
        releases[i - 1].id,
      );
    }
  });

  it("names the top entry as the latest release", () => {
    expect(LATEST_RELEASE_ID).toBe(releases[0].id);
  });

  it("dates every entry with a real calendar date", () => {
    for (const { id, date } of releases) {
      expect(date, `id ${id}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      // new Date() rolls 2026-02-30 over to March; a real date round-trips.
      expect(new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10), `id ${id}`).toBe(date);
    }
  });

  it("gives every entry a title and a body", () => {
    for (const { id, title, body } of releases) {
      expect(title.trim(), `id ${id} title`).not.toBe("");
      expect(body.trim(), `id ${id} body`).not.toBe("");
    }
  });

  it("keeps em dashes out of the copy", () => {
    for (const { id, title, body } of releases) {
      expect(title, `id ${id} title`).not.toContain("—");
      expect(body, `id ${id} body`).not.toContain("—");
    }
  });
});
