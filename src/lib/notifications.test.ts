import { describe, expect, it } from "vitest";
import {
  joinRequestedCopy,
  mealSetCopy,
  meetingCreatedCopy,
  recipeAddedCopy,
  requestApprovedCopy,
} from "./notifications";

// The group name is the title because a member can be in several groups.
// Dates are short so the body fits one lock-screen line.
describe("notification copy", () => {
  it("meeting created", () => {
    expect(
      meetingCreatedCopy({
        groupName: "Tuesday Group",
        actorName: "Sameer",
        date: "2026-10-13",
        title: "Game night",
        meetingId: "m1",
      }),
    ).toEqual({
      title: "Tuesday Group",
      body: "Sameer added a meeting: Game night on Tue, Oct 13",
      url: "/meetings/m1",
    });
  });

  it("meal set", () => {
    expect(
      mealSetCopy({
        groupName: "Tuesday Group",
        actorName: "Sameer",
        date: "2026-10-13",
        recipeName: "Tacos",
        meetingId: "m1",
      }),
    ).toEqual({
      title: "Tuesday Group",
      body: "Sameer set the meal for Tue, Oct 13: Tacos",
      url: "/meetings/m1",
    });
  });

  it("recipe added", () => {
    expect(
      recipeAddedCopy({ groupName: "Tuesday Group", actorName: "Sameer", recipeName: "Tacos", recipeId: "r1" }),
    ).toEqual({ title: "Tuesday Group", body: "Sameer added a recipe: Tacos", url: "/recipes/r1" });
  });

  it("join requested", () => {
    expect(joinRequestedCopy({ groupName: "Tuesday Group", requesterName: "Priya" })).toEqual({
      title: "Tuesday Group",
      body: "Priya asked to join",
      url: "/group",
    });
  });

  it("request approved", () => {
    expect(requestApprovedCopy({ groupName: "Tuesday Group" })).toEqual({
      title: "Tuesday Group",
      body: "You're in. Welcome to Tuesday Group.",
      url: "/",
    });
  });
});
