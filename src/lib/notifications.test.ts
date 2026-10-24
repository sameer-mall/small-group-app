import { describe, expect, it } from "vitest";
import {
  joinRequestedCopy,
  mealSetCopy,
  meetingCreatedCopy,
  recipeAddedCopy,
  requestApprovedCopy,
} from "./notifications";

// The group name is the title because a member can be in several groups, and
// the link goes through /open so the app switches to that group first.
// Dates are short so the body fits one lock-screen line.
describe("notification copy", () => {
  it("meeting created", () => {
    expect(
      meetingCreatedCopy({
        groupId: "g1",
        groupName: "Tuesday Group",
        actorName: "Sameer",
        date: "2026-10-13",
        title: "Game night",
        meetingId: "m1",
      }),
    ).toEqual({
      title: "Tuesday Group",
      body: "Sameer added a meeting: Game night on Tue, Oct 13",
      url: "/open?group=g1&next=%2Fmeetings%2Fm1",
    });
  });

  it("meal set", () => {
    expect(
      mealSetCopy({
        groupId: "g1",
        groupName: "Tuesday Group",
        actorName: "Sameer",
        date: "2026-10-13",
        recipeName: "Tacos",
        meetingId: "m1",
      }),
    ).toEqual({
      title: "Tuesday Group",
      body: "Sameer set the meal for Tue, Oct 13: Tacos",
      url: "/open?group=g1&next=%2Fmeetings%2Fm1",
    });
  });

  it("recipe added", () => {
    expect(
      recipeAddedCopy({
        groupId: "g1",
        groupName: "Tuesday Group",
        actorName: "Sameer",
        recipeName: "Tacos",
        recipeId: "r1",
      }),
    ).toEqual({
      title: "Tuesday Group",
      body: "Sameer added a recipe: Tacos",
      url: "/open?group=g1&next=%2Frecipes%2Fr1",
    });
  });

  it("join requested", () => {
    expect(joinRequestedCopy({ groupId: "g1", groupName: "Tuesday Group", requesterName: "Priya" })).toEqual({
      title: "Tuesday Group",
      body: "Priya asked to join",
      url: "/open?group=g1&next=%2Fgroup",
    });
  });

  it("request approved", () => {
    expect(requestApprovedCopy({ groupId: "g1", groupName: "Tuesday Group" })).toEqual({
      title: "Tuesday Group",
      body: "You're in. Welcome to Tuesday Group.",
      url: "/open?group=g1&next=%2F",
    });
  });
});
