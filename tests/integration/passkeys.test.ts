import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { passkey } from "@/db/schema";
import { passkeyIdForCredential, passkeysFor, removePasskey } from "@/lib/passkeys";

async function mkUser(id: string) {
  await db.execute(sql`insert into "user" (id, name, email, email_verified, created_at, updated_at)
    values (${id}, ${id}, ${id + "@example.com"}, true, now(), now()) on conflict do nothing`);
  return id;
}

async function mkPasskey(userId: string, name: string, createdAt: Date, credentialID = `cred_${crypto.randomUUID()}`) {
  const id = `pk_${crypto.randomUUID()}`;
  await db.insert(passkey).values({
    id,
    name,
    publicKey: "public-key",
    userId,
    credentialID,
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

// The after hook in src/lib/auth.ts turns the credential the plugin just
// verified into the row id it remembers in the "this device" cookie.
describe("passkeyIdForCredential", () => {
  it("finds the row for a credential", async () => {
    const cal = await mkUser(`u_cal_${crypto.randomUUID()}`);
    const credentialID = `cred_${crypto.randomUUID()}`;
    const id = await mkPasskey(cal, "iPhone", new Date(), credentialID);
    expect(await passkeyIdForCredential(credentialID)).toBe(id);
  });

  it("finds nothing for an unknown credential", async () => {
    expect(await passkeyIdForCredential(`cred_${crypto.randomUUID()}`)).toBeNull();
  });
});
