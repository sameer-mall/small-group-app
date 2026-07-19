import { describe, expect, it } from "vitest";
import { cn, initials } from "./utils";

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
