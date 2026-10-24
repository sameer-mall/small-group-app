import { del as blobDel, put as blobPut } from "@vercel/blob";
import { env, type Env } from "@/lib/env";

// Where processed avatars live. src/lib/avatars.ts decides what goes in; this
// decides where. Three backends, one interface, chosen once from the env.

export type AvatarStorage = {
  // Returns the URL that goes in user.image.
  put(pathname: string, bytes: Buffer, contentType: string): Promise<string>;
  del(url: string): Promise<void>;
  // True for a URL this backend produced, so a Google profile URL is never
  // handed to del().
  owns(url: string): boolean;
};

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

// Production: a public Vercel Blob store. The SDK finds its own credentials:
// BLOB_STORE_ID plus the OIDC token Vercel hands each request (or a
// BLOB_READ_WRITE_TOKEN, if one is set). Pathnames already carry a UUID, so
// no random suffix; the URL changes on every upload, which is what makes a
// year-long cache header safe.
export const blobStorage: AvatarStorage = {
  async put(pathname, bytes, contentType) {
    const blob = await blobPut(pathname, bytes, {
      access: "public",
      contentType,
      addRandomSuffix: false,
      cacheControlMaxAge: ONE_YEAR_SECONDS,
    });
    return blob.url;
  },
  async del(url) {
    await blobDel(url);
  },
  owns(url) {
    try {
      return new URL(url).hostname.endsWith(".blob.vercel-storage.com");
    } catch {
      return false;
    }
  },
};

// Local dev and CI: the bytes ride along in user.image as a data URL. A 256px
// WebP is about 15 KB, nothing for a local database, and the whole flow runs
// with no account and no network.
export const inlineStorage: AvatarStorage = {
  async put(_pathname, bytes, contentType) {
    return `data:${contentType};base64,${bytes.toString("base64")}`;
  },
  async del() {},
  owns(url) {
    return url.startsWith("data:");
  },
};

// Blob when the SDK will find credentials: a read-write token anywhere, or a
// connected store (BLOB_STORE_ID) where an OIDC token exists, which is every
// request on Vercel and a local .env.local after `vercel env pull`. null means
// photos are off: on Vercel without a store, uploads are hidden rather than
// silently stored inline in the production database.
export function selectStorage(
  e: Pick<Env, "BLOB_READ_WRITE_TOKEN" | "BLOB_STORE_ID" | "VERCEL_OIDC_TOKEN" | "VERCEL_ENV">,
): AvatarStorage | null {
  if (e.BLOB_READ_WRITE_TOKEN) return blobStorage;
  if (e.BLOB_STORE_ID && (e.VERCEL_ENV || e.VERCEL_OIDC_TOKEN)) return blobStorage;
  if (e.VERCEL_ENV) return null;
  return inlineStorage;
}

export const avatarStorage = selectStorage(env);
export const avatarsEnabled = avatarStorage !== null;
