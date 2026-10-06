import { describe, expect, it } from "vitest";
import { displayNameForm } from "@/lib/profile";

function parse(name: unknown) {
  return displayNameForm.safeParse({ name });
}

describe("displayNameForm", () => {
  it("accepts a plain name, trimmed", () => {
    const result = parse("  Sam Miller ");
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("Sam Miller");
  });

  it("rejects an empty name with user-facing copy", () => {
    const result = parse("");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("Name can't be empty.");
  });

  it("rejects a whitespace-only name", () => {
    const result = parse("   ");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("Name can't be empty.");
  });

  it("rejects a missing name field", () => {
    const result = parse(undefined);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("Name can't be empty.");
  });

  it("caps the name at 60 characters", () => {
    expect(parse("a".repeat(60)).success).toBe(true);
    const result = parse("a".repeat(61));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toBe("Keep your name under 60 characters.");
    }
  });
});
