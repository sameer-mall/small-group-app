import { describe, expect, it } from "vitest";
import { cardState, urlBase64ToUint8Array } from "./notifications-state";

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
