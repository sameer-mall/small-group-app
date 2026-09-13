import { describe, expect, it } from "vitest";
import { cn, formatMeetingDate, initials, safeNextPath } from "./utils";

describe("cn", () => {
  it("merges conflicting tailwind classes, last wins", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("drops falsy values", () => {
    expect(cn("a", false && "b", undefined, "c")).toBe("a c");
  });
});

describe("initials", () => {
  it("takes the first letter of the first and last name", () => {
    expect(initials("Priya K.")).toBe("PK");
    expect(initials("Sarah Marie Miller")).toBe("SM");
  });

  it("takes the first two characters of a single-word name", () => {
    expect(initials("Cher")).toBe("CH");
  });

  it("collapses extra whitespace", () => {
    expect(initials("  Dan   K.  ")).toBe("DK");
  });

  it("falls back to a placeholder for an empty name", () => {
    expect(initials("")).toBe("?");
    expect(initials("   ")).toBe("?");
  });
});

describe("safeNextPath", () => {
  it("allows same-origin absolute paths", () => {
    expect(safeNextPath("/")).toBe("/");
    expect(safeNextPath("/group")).toBe("/group");
    expect(safeNextPath("/join/abc123")).toBe("/join/abc123");
  });

  it("rejects absolute URLs", () => {
    expect(safeNextPath("https://evil.com")).toBe("/");
    expect(safeNextPath("http://evil.com/login")).toBe("/");
  });

  it("rejects protocol-relative and backslash forms browsers navigate off-origin", () => {
    expect(safeNextPath("//evil.com")).toBe("/");
    expect(safeNextPath("/\\evil.com")).toBe("/");
  });

  it("falls back to / for missing or non-path values", () => {
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath(null)).toBe("/");
    expect(safeNextPath("")).toBe("/");
    expect(safeNextPath("evil.com")).toBe("/");
  });
});

describe("formatMeetingDate", () => {
  it("formats a date-only string in long form", () => {
    expect(formatMeetingDate("2026-09-03")).toBe("Thursday, September 3");
  });

  it("accepts extra Intl options, e.g. the year the detail page shows", () => {
    expect(
      formatMeetingDate("2026-09-03", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      }),
    ).toBe("Thursday, September 3, 2026");
  });
});
