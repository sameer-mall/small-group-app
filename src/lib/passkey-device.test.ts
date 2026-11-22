import { describe, expect, it } from "vitest";
import {
  hasJustSignedIn,
  kindForDeviceName,
  markOffered,
  noteJustSignedIn,
  passkeyCopy,
  passkeyErrorKind,
  passkeyMethod,
  takeJustSignedIn,
  wasOffered,
} from "./passkey-device";

const UA = {
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 27_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.1 Mobile/15E148 Safari/604.1",
  androidPhone:
    "Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36",
  androidTablet:
    "Mozilla/5.0 (Linux; Android 16; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
  mac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/27.1 Safari/605.1.15",
  windows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
  linux: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/142.0.0.0 Safari/537.36",
};

describe("passkeyMethod", () => {
  it.each([
    ["iphone", "face-id", "iPhone", "This iPhone"],
    ["androidPhone", "fingerprint", "Android phone", "This phone"],
    ["androidTablet", "fingerprint", "Android tablet", "This tablet"],
    ["mac", "passkey", "Mac", "This Mac"],
    ["windows", "passkey", "Computer", "This computer"],
    ["linux", "passkey", "Computer", "This computer"],
  ] as const)("%s is %s, named %s", (key, kind, deviceName, thisDevice) => {
    expect(passkeyMethod(UA[key])).toMatchObject({ kind, deviceName, thisDevice });
  });

  it("treats an empty user agent as a computer", () => {
    expect(passkeyMethod("").kind).toBe("passkey");
  });
});

describe("passkeyCopy", () => {
  it("speaks Face ID on an iPhone", () => {
    const copy = passkeyCopy(passkeyMethod(UA.iphone));
    expect(copy.signInButton).toBe("Sign in with Face ID");
    expect(copy.offerTitle).toBe("Sign in with Face ID next time?");
    expect(copy.removedNotice).toBe(
      "Face ID was turned off for this phone. Sign in with an email code, then you can turn it back on in Settings.",
    );
  });

  it("speaks fingerprint on Android and passkey elsewhere", () => {
    expect(passkeyCopy(passkeyMethod(UA.androidPhone)).signInButton).toBe("Sign in with fingerprint");
    expect(passkeyCopy(passkeyMethod(UA.linux)).signInButton).toBe("Sign in with a passkey");
    expect(passkeyCopy(passkeyMethod(UA.linux)).turnOn).toBe("Turn on passkey sign-in");
  });

  it("keeps Face ID capitalized in the failure message", () => {
    expect(passkeyCopy(passkeyMethod(UA.iphone)).turnOnFailed).toBe("Couldn't turn on Face ID. Try again from Settings.");
    expect(passkeyCopy(passkeyMethod(UA.androidPhone)).turnOnFailed).toBe(
      "Couldn't turn on fingerprint sign-in. Try again from Settings.",
    );
  });

  it("names the device in the fingerprint offer", () => {
    expect(passkeyCopy(passkeyMethod(UA.androidTablet)).offerBody).toBe(
      "Skip the email code. Your fingerprint unlocks Small Group on this tablet.",
    );
    expect(passkeyCopy(passkeyMethod(UA.androidPhone)).offerBody).toBe(
      "Skip the email code. Your fingerprint unlocks Small Group on this phone.",
    );
  });

  it("never uses an em dash", () => {
    for (const ua of Object.values(UA)) {
      for (const line of Object.values(passkeyCopy(passkeyMethod(ua)))) expect(line).not.toContain("—");
    }
  });
});

describe("kindForDeviceName", () => {
  it("maps stored device names back to an icon", () => {
    expect(kindForDeviceName("iPhone")).toBe("face-id");
    expect(kindForDeviceName("Android phone")).toBe("fingerprint");
    expect(kindForDeviceName("Mac")).toBe("passkey");
    expect(kindForDeviceName(null)).toBe("passkey");
  });
});

describe("passkeyErrorKind", () => {
  it("treats a closed or cancelled prompt as cancelled", () => {
    expect(passkeyErrorKind({ code: "AUTH_CANCELLED" })).toBe("cancelled");
    expect(passkeyErrorKind({ code: "ERROR_CEREMONY_ABORTED" })).toBe("cancelled");
    expect(passkeyErrorKind({ message: "NotAllowedError: The operation either timed out or was not allowed." })).toBe(
      "cancelled",
    );
  });

  it("knows a passkey the server no longer has", () => {
    expect(passkeyErrorKind({ code: "PASSKEY_NOT_FOUND" })).toBe("removed");
  });

  it("calls anything else other", () => {
    expect(passkeyErrorKind({ code: "SOMETHING_ELSE" })).toBe("other");
    expect(passkeyErrorKind(null)).toBe("other");
  });
});

function memoryStore() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
}

const brokenStore = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("SecurityError");
  },
  removeItem: () => {
    throw new Error("SecurityError");
  },
};

describe("device storage", () => {
  it("remembers the offer once marked", () => {
    const store = memoryStore();
    expect(wasOffered(store)).toBe(false);
    markOffered(store);
    expect(wasOffered(store)).toBe(true);
  });

  it("counts missing storage as already offered", () => {
    // In node there is no window, so the default store is unavailable and
    // wasOffered() must treat that as offered rather than show the sheet.
    expect(wasOffered()).toBe(true);
    expect(wasOffered(undefined)).toBe(true);
  });

  it("hands out the just-signed-in note once", () => {
    const store = memoryStore();
    noteJustSignedIn(store);
    expect(hasJustSignedIn(store)).toBe(true);
    expect(takeJustSignedIn(store)).toBe(true);
    expect(hasJustSignedIn(store)).toBe(false);
    expect(takeJustSignedIn(store)).toBe(false);
  });

  it("acts as if nothing is stored when storage throws", () => {
    expect(() => markOffered(brokenStore)).not.toThrow();
    expect(wasOffered(brokenStore)).toBe(true); // can't remember: never risk nagging
    expect(() => noteJustSignedIn(brokenStore)).not.toThrow();
    expect(hasJustSignedIn(brokenStore)).toBe(false);
    expect(takeJustSignedIn(brokenStore)).toBe(false);
  });
});
