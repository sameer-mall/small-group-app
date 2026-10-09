import { describe, expect, it } from "vitest";
import { cardState, shouldPromptForNotifications, urlBase64ToUint8Array } from "./notifications-state";

describe("cardState", () => {
  it("is unsupported wherever push can't work, whatever else is true", () => {
    expect(cardState({ supported: false, permission: "default", subscribed: false })).toBe("unsupported");
    expect(cardState({ supported: false, permission: "granted", subscribed: true })).toBe("unsupported");
    expect(cardState({ supported: false, permission: "denied", subscribed: false })).toBe("unsupported");
  });

  it("is blocked once permission was denied", () => {
    expect(cardState({ supported: true, permission: "denied", subscribed: false })).toBe("blocked");
    expect(cardState({ supported: true, permission: "denied", subscribed: true })).toBe("blocked");
  });

  it("reflects the browser's subscription otherwise", () => {
    expect(cardState({ supported: true, permission: "granted", subscribed: true })).toBe("on");
    expect(cardState({ supported: true, permission: "granted", subscribed: false })).toBe("off");
    expect(cardState({ supported: true, permission: "default", subscribed: false })).toBe("off");
  });
});

describe("urlBase64ToUint8Array", () => {
  it("decodes base64url with missing padding", () => {
    // "hi" in base64url is "aGk" (padding stripped).
    expect(Array.from(urlBase64ToUint8Array("aGk"))).toEqual([104, 105]);
    // '-' and '_' are base64url's substitutes for '+' and '/'.
    expect(Array.from(urlBase64ToUint8Array("-_8"))).toEqual([251, 255]);
  });
});

describe("shouldPromptForNotifications", () => {
  const ready = {
    supported: true,
    standalone: true,
    permission: "default" as NotificationPermission,
    subscribed: false,
    remembered: null,
    deferred: false,
  };

  it("asks an installed member who hasn't decided, once", () => {
    expect(shouldPromptForNotifications(ready)).toBe(true);
  });

  it("never asks where push can't work or the app isn't installed", () => {
    expect(shouldPromptForNotifications({ ...ready, supported: false })).toBe(false);
    expect(shouldPromptForNotifications({ ...ready, standalone: false })).toBe(false);
  });

  it("never asks once the question has been answered", () => {
    expect(shouldPromptForNotifications({ ...ready, permission: "granted" })).toBe(false);
    expect(shouldPromptForNotifications({ ...ready, permission: "denied" })).toBe(false);
    expect(shouldPromptForNotifications({ ...ready, subscribed: true })).toBe(false);
    expect(shouldPromptForNotifications({ ...ready, remembered: "done" })).toBe(false);
    expect(shouldPromptForNotifications({ ...ready, remembered: "dismissed" })).toBe(false);
  });

  it("waits a launch while What's new has the member's attention", () => {
    expect(shouldPromptForNotifications({ ...ready, deferred: true })).toBe(false);
  });
});
