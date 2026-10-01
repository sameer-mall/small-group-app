import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

const required = {
  DATABASE_URL: "postgres://smallgroup:smallgroup@localhost:5432/smallgroup",
  BETTER_AUTH_SECRET: "test-secret",
};

describe("parseEnv", () => {
  it("accepts the two required variables alone", () => {
    expect(parseEnv(required)).toEqual(required);
  });

  it("names every missing required variable at once", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL[\s\S]*BETTER_AUTH_SECRET/);
  });

  it("treats a blank .env line as unset", () => {
    expect(() => parseEnv({ ...required, DATABASE_URL: "" })).toThrow(/DATABASE_URL/);
    expect(parseEnv({ ...required, GOOGLE_CLIENT_ID: "" }).GOOGLE_CLIENT_ID).toBeUndefined();
  });

  it("requires BETTER_AUTH_URL, when set, to be an http(s) URL", () => {
    expect(parseEnv({ ...required, BETTER_AUTH_URL: "http://localhost:3000" }).BETTER_AUTH_URL).toBe(
      "http://localhost:3000",
    );
    expect(() => parseEnv({ ...required, BETTER_AUTH_URL: "localhost:3000" })).toThrow(
      /BETTER_AUTH_URL/,
    );
  });

  it("drops variables the app doesn't read", () => {
    expect(parseEnv({ ...required, HOME: "/Users/someone" })).not.toHaveProperty("HOME");
  });
});
