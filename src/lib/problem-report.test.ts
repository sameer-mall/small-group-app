import { beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => {
  const replay = { flush: vi.fn(() => Promise.resolve()) };
  return {
    replay,
    setUser: vi.fn(),
    getReplay: vi.fn(() => replay as typeof replay | undefined),
    captureFeedback: vi.fn(),
  };
});
vi.mock("@sentry/nextjs", () => sentry);

import { forgetUser, identifyUser, sendProblemReport, startProblemReport } from "./problem-report";

const ruth = { id: "u_ruth", name: "Ruth", email: "ruth@example.com" };

beforeEach(() => {
  forgetUser();
  vi.clearAllMocks();
});

describe("identity", () => {
  it("tells Sentry only the user's id", () => {
    identifyUser(ruth);
    expect(sentry.setUser).toHaveBeenCalledWith({ id: "u_ruth" });
  });

  it("forgets the user, name and email included, on sign-out", () => {
    identifyUser(ruth);
    forgetUser();
    expect(sentry.setUser).toHaveBeenLastCalledWith(null);
    sendProblemReport("Still broken");
    expect(sentry.captureFeedback).toHaveBeenCalledWith(
      { message: "Still broken" },
      { includeReplay: true },
    );
  });
});

describe("problem reports", () => {
  it("carry the message, the reporter's name and email, and the replay", () => {
    identifyUser(ruth);
    sendProblemReport("The meal list didn't load.");
    expect(sentry.captureFeedback).toHaveBeenCalledWith(
      { message: "The meal list didn't load.", name: "Ruth", email: "ruth@example.com" },
      { includeReplay: true },
    );
  });

  it("link to the error they were sent from", () => {
    sendProblemReport("Got the error screen", "evt_123");
    expect(sentry.captureFeedback).toHaveBeenCalledWith(
      { message: "Got the error screen", associatedEventId: "evt_123" },
      { includeReplay: true },
    );
  });

  it("upload the replay buffer as soon as the form opens, before the typing", () => {
    startProblemReport();
    expect(sentry.replay.flush).toHaveBeenCalledOnce();
  });

  it("open fine when no replay is running (no DSN)", () => {
    sentry.getReplay.mockReturnValueOnce(undefined);
    expect(() => startProblemReport()).not.toThrow();
  });
});
