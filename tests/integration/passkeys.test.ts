import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { passkey } from "@/db/schema";
import { ownsPasskey, passkeyForDevice, passkeysFor, removePasskey } from "@/lib/passkeys";

async function mkUser(id: string) {
  await db.execute(sql`insert into "user" (id, name, email, email_verified, created_at, updated_at)
    values (${id}, ${id}, ${id + "@example.com"}, true, now(), now()) on conflict do nothing`);
  return id;
}

async function mkPasskey(userId: string, name: string, createdAt: Date) {
  const id = `pk_${crypto.randomUUID()}`;
  await db.insert(passkey).values({
    id,
    name,
    publicKey: "public-key",
    userId,
    credentialID: `cred_${crypto.randomUUID()}`,
    counter: 0,
    deviceType: "multiDevice",
    backedUp: true,
    transports: "internal",
    createdAt,
  });
  return id;
}

describe("passkeys domain", () => {
  let ada: string, ben: string, adaPhone: string, adaMac: string, benPhone: string;
  beforeAll(async () => {
    ada = await mkUser(`u_ada_${crypto.randomUUID()}`);
    ben = await mkUser(`u_ben_${crypto.randomUUID()}`);
    adaMac = await mkPasskey(ada, "Mac", new Date("2026-10-02T12:00:00Z"));
    adaPhone = await mkPasskey(ada, "iPhone", new Date("2026-11-15T12:00:00Z"));
    benPhone = await mkPasskey(ben, "iPhone", new Date("2026-11-01T12:00:00Z"));
  });

  it("lists only the member's own passkeys, oldest first, without key material", async () => {
    const list = await passkeysFor(ada);
    expect(list.map((p) => p.id)).toEqual([adaMac, adaPhone]);
    expect(Object.keys(list[0]).sort()).toEqual(["createdAt", "id", "name"]);
  });

  it("knows who owns a passkey", async () => {
    expect(await ownsPasskey(ada, adaPhone)).toBe(true);
    expect(await ownsPasskey(ada, benPhone)).toBe(false);
  });

  it("refuses to remove someone else's passkey and leaves it in place", async () => {
    await expect(removePasskey(ada, benPhone)).rejects.toThrow("not-found");
    expect((await passkeysFor(ben)).map((p) => p.id)).toEqual([benPhone]);
  });

  it("removes the member's own passkey", async () => {
    await removePasskey(ada, adaMac);
    expect((await passkeysFor(ada)).map((p) => p.id)).toEqual([adaPhone]);
  });

  it("refuses a passkey that's already gone", async () => {
    await expect(removePasskey(ada, adaMac)).rejects.toThrow("not-found");
  });
});

// After a passkey sign-in the server can't see which credential was used.
// passkeyForDevice guesses only when the guess can't be wrong.
describe("passkeyForDevice", () => {
  // A laptop can sign in with the phone's passkey (another device's QR code).
  // Naming that phone passkey "This computer" would let Remove delete it.
  it("won't guess a passkey named for another device", async () => {
    const cal = await mkUser(`u_cal_${crypto.randomUUID()}`);
    await mkPasskey(cal, "Mac", new Date());
    expect(await passkeyForDevice(cal, "iPhone")).toBeNull();
  });

  it("picks the member's only passkey when it's named for this device", async () => {
    const fay = await mkUser(`u_fay_${crypto.randomUUID()}`);
    const only = await mkPasskey(fay, "iPhone", new Date());
    expect(await passkeyForDevice(fay, "iPhone")).toBe(only);
  });

  it("picks the only one named for this kind of device", async () => {
    const dee = await mkUser(`u_dee_${crypto.randomUUID()}`);
    await mkPasskey(dee, "Mac", new Date());
    const phone = await mkPasskey(dee, "iPhone", new Date());
    expect(await passkeyForDevice(dee, "iPhone")).toBe(phone);
  });

  it("gives up when two could be this device, or none", async () => {
    const eve = await mkUser(`u_eve_${crypto.randomUUID()}`);
    await mkPasskey(eve, "iPhone", new Date());
    await mkPasskey(eve, "iPhone", new Date());
    expect(await passkeyForDevice(eve, "iPhone")).toBeNull();
    expect(await passkeyForDevice(eve, "Android phone")).toBeNull();
  });
});
