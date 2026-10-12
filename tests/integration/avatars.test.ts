import sharp from "sharp";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { AvatarStorage } from "@/lib/avatar-storage";
import { AVATAR_SIZE, removeAvatar, saveAvatar } from "@/lib/avatars";

const GOOGLE = "https://lh3.googleusercontent.com/a/photo";

async function mkUser(id: string, image: string | null = null) {
  await db.execute(sql`insert into "user" (id, name, email, email_verified, image, created_at, updated_at)
    values (${id}, ${id}, ${id + "@example.com"}, true, ${image}, now(), now())
    on conflict (id) do update set image = ${image}`);
  return id;
}

async function imageOf(id: string) {
  const { rows } = await db.execute(sql`select image from "user" where id = ${id}`);
  return (rows[0] as { image: string | null }).image;
}

// Records what it was asked to do; URLs look like fake:<pathname>.
function fakeStorage() {
  const puts: { pathname: string; bytes: Buffer; contentType: string }[] = [];
  const dels: string[] = [];
  const storage: AvatarStorage = {
    async put(pathname, bytes, contentType) {
      puts.push({ pathname, bytes, contentType });
      return `fake:${pathname}`;
    },
    async del(url) {
      dels.push(url);
    },
    owns: (url) => url.startsWith("fake:"),
  };
  return { storage, puts, dels };
}

let png: Buffer;
beforeAll(async () => {
  png = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#cc3333" } })
    .png()
    .toBuffer();
});

describe("saveAvatar", () => {
  let fake: ReturnType<typeof fakeStorage>;
  beforeEach(() => {
    fake = fakeStorage();
  });

  it("stores the processed photo under the user's path and points the row at it", async () => {
    const ivy = await mkUser("u_av_ivy");
    const url = await saveAvatar(ivy, png, fake.storage);
    expect(url).toMatch(/^fake:avatars\/u_av_ivy\/[0-9a-f-]{36}\.webp$/);
    expect(await imageOf(ivy)).toBe(url);
    expect(fake.puts).toHaveLength(1);
    expect(fake.puts[0].contentType).toBe("image/webp");
    const meta = await sharp(fake.puts[0].bytes).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", AVATAR_SIZE, AVATAR_SIZE]);
    expect(fake.dels).toEqual([]);
  });

  it("deletes the previous photo of ours after replacing it", async () => {
    const jon = await mkUser("u_av_jon", "fake:avatars/u_av_jon/old.webp");
    const url = await saveAvatar(jon, png, fake.storage);
    expect(await imageOf(jon)).toBe(url);
    expect(fake.dels).toEqual(["fake:avatars/u_av_jon/old.webp"]);
  });

  it("leaves a Google photo alone when replacing it", async () => {
    const kim = await mkUser("u_av_kim", GOOGLE);
    await saveAvatar(kim, png, fake.storage);
    expect(fake.dels).toEqual([]);
  });

  it("refuses when photos are off", async () => {
    const lee = await mkUser("u_av_lee");
    await expect(saveAvatar(lee, png, null)).rejects.toThrow("unavailable");
    expect(await imageOf(lee)).toBeNull();
  });

  it("refuses a user that doesn't exist, storing nothing", async () => {
    await expect(saveAvatar("u_av_nobody", png, fake.storage)).rejects.toThrow("not-found");
    expect(fake.puts).toEqual([]);
  });

  it("refuses bytes that aren't an image, storing nothing", async () => {
    const max = await mkUser("u_av_max");
    await expect(saveAvatar(max, Buffer.from("nope"), fake.storage)).rejects.toThrow(
      "unreadable-image",
    );
    expect(fake.puts).toEqual([]);
    expect(await imageOf(max)).toBeNull();
  });
});

describe("removeAvatar", () => {
  it("clears the row and deletes a photo of ours", async () => {
    const fake = fakeStorage();
    const ned = await mkUser("u_av_ned", "fake:avatars/u_av_ned/x.webp");
    await removeAvatar(ned, fake.storage);
    expect(await imageOf(ned)).toBeNull();
    expect(fake.dels).toEqual(["fake:avatars/u_av_ned/x.webp"]);
  });

  it("clears a Google photo without deleting anything", async () => {
    const fake = fakeStorage();
    const ola = await mkUser("u_av_ola", GOOGLE);
    await removeAvatar(ola, fake.storage);
    expect(await imageOf(ola)).toBeNull();
    expect(fake.dels).toEqual([]);
  });

  it("still clears the row when photos are off", async () => {
    const pat = await mkUser("u_av_pat", GOOGLE);
    await removeAvatar(pat, null);
    expect(await imageOf(pat)).toBeNull();
  });

  it("refuses a user that doesn't exist", async () => {
    await expect(removeAvatar("u_av_nobody", fakeStorage().storage)).rejects.toThrow("not-found");
  });
});
