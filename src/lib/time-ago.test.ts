import { describe, expect, it } from "vitest";
import { timeAgo } from "@/lib/time-ago";

const now = new Date("2026-11-26T20:00:00Z");
const ago = (ms: number) => timeAgo(new Date(now.getTime() - ms), now);

describe("timeAgo", () => {
  it("reads naturally", () => {
    expect(ago(20_000)).toBe("Just now");
    expect(ago(60_000)).toBe("1 min ago");
    expect(ago(12 * 60_000)).toBe("12 min ago");
    expect(ago(60 * 60_000)).toBe("1 hr ago");
    expect(ago(5 * 60 * 60_000)).toBe("5 hr ago");
    expect(ago(26 * 60 * 60_000)).toBe("1 day ago");
    expect(ago(3 * 24 * 60 * 60_000)).toBe("3 days ago");
  });
  it("never shows the future", () => {
    expect(ago(-5_000)).toBe("Just now");
  });
});
