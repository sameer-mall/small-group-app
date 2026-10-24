import { describe, expect, it } from "vitest";
import { blobStorage, inlineStorage, selectStorage } from "./avatar-storage";

describe("selectStorage", () => {
  it("uses Vercel Blob whenever the token is set", () => {
    expect(selectStorage({ BLOB_READ_WRITE_TOKEN: "t" })).toBe(blobStorage);
    expect(selectStorage({ BLOB_READ_WRITE_TOKEN: "t", VERCEL_ENV: "production" })).toBe(
      blobStorage,
    );
  });

  it("uses Vercel Blob through OIDC when a store is connected and the code runs on Vercel", () => {
    expect(selectStorage({ BLOB_STORE_ID: "store_x", VERCEL_ENV: "production" })).toBe(blobStorage);
    expect(selectStorage({ BLOB_STORE_ID: "store_x", VERCEL_ENV: "preview" })).toBe(blobStorage);
  });

  it("uses Vercel Blob locally with a store id only when an OIDC token was pulled", () => {
    expect(selectStorage({ BLOB_STORE_ID: "store_x", VERCEL_OIDC_TOKEN: "eyJ" })).toBe(blobStorage);
    expect(selectStorage({ BLOB_STORE_ID: "store_x" })).toBe(inlineStorage);
  });

  it("stores inline off Vercel without credentials (local, CI)", () => {
    expect(selectStorage({})).toBe(inlineStorage);
  });

  it("disables photos on Vercel without a store, rather than filling the database", () => {
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
