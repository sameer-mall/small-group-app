import { describe, expect, it } from "vitest";
import { blobStorage, inlineStorage, selectStorage } from "./avatar-storage";

describe("selectStorage", () => {
  it("uses Vercel Blob whenever the token is set", () => {
    expect(selectStorage({ BLOB_READ_WRITE_TOKEN: "t" })).toBe(blobStorage);
    expect(selectStorage({ BLOB_READ_WRITE_TOKEN: "t", VERCEL_ENV: "production" })).toBe(
      blobStorage,
    );
  });

  it("stores inline off Vercel without a token (local, CI)", () => {
    expect(selectStorage({})).toBe(inlineStorage);
  });

  it("disables photos on Vercel without a token, rather than filling the database", () => {
    expect(selectStorage({ VERCEL_ENV: "preview" })).toBeNull();
    expect(selectStorage({ VERCEL_ENV: "production" })).toBeNull();
  });
});

describe("inlineStorage", () => {
  it("returns a data URL that carries the bytes", async () => {
    const url = await inlineStorage.put("avatars/u/x.webp", Buffer.from("hello"), "image/webp");
    expect(url).toBe(`data:image/webp;base64,${Buffer.from("hello").toString("base64")}`);
    expect(inlineStorage.owns(url)).toBe(true);
    expect(inlineStorage.owns("https://lh3.googleusercontent.com/a/x")).toBe(false);
  });

  it("has nothing to delete", async () => {
    await expect(inlineStorage.del("data:image/webp;base64,aGVsbG8=")).resolves.toBeUndefined();
  });
});

describe("blobStorage.owns", () => {
  it("recognises only the store's own URLs", () => {
    expect(blobStorage.owns("https://abc123.public.blob.vercel-storage.com/avatars/u/x.webp")).toBe(
      true,
    );
    expect(blobStorage.owns("https://lh3.googleusercontent.com/a/x")).toBe(false);
    expect(blobStorage.owns("data:image/webp;base64,aGVsbG8=")).toBe(false);
    expect(blobStorage.owns("not a url")).toBe(false);
  });
});
