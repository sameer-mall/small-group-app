import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Every route Next serves carries the root layout's implicit cache tag,
// _N_T_/layout, and that includes the force-static service worker at
// /serwist/sw.js (src/app/serwist/[path]/route.ts). Invalidating the tag marks
// sw.js stale, and Vercel then rebuilds it at runtime in a function that can't
// load Serwist's config check, and has no .next/static or public/ to build a
// precache manifest from (SMALL-GROUP-7). Revalidate a route group's layout
// instead, e.g. revalidatePath("/(app)", "layout"). Implicit tags written by
// hand are flagged too: revalidatePath covers every legitimate use of them.

const ROOT = join(__dirname, "..");
const SRC = join(ROOT, "src");

const QUOTE = "[\"'`]";
const ROOT_LAYOUT = [
  // revalidatePath("/", "layout"), and "" (Next reads it as "/").
  new RegExp(`revalidatePath\\(\\s*(${QUOTE})\\/?\\1\\s*,\\s*(${QUOTE})layout\\2`, "g"),
  // revalidateTag("_N_T_/layout") and the like.
  new RegExp(`(?:revalidateTag|updateTag)\\(\\s*${QUOTE}_N_T_`, "g"),
];

function rootLayoutRevalidations(source: string): { line: number; call: string }[] {
  const found: { line: number; call: string }[] = [];
  for (const pattern of ROOT_LAYOUT) {
    for (const match of source.matchAll(pattern)) {
      found.push({
        line: source.slice(0, match.index).split("\n").length,
        call: match[0].replace(/\s+/g, " "),
      });
    }
  }
  return found;
}

function sourceFiles(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: "utf8" })
    .filter((file) => /\.tsx?$/.test(file) && !file.includes(".test."))
    .map((file) => join(SRC, file));
}

describe("revalidation", () => {
  it("never invalidates the root layout's cache tag", () => {
    const report = sourceFiles().flatMap((file) =>
      rootLayoutRevalidations(readFileSync(file, "utf8")).map(
        ({ line, call }) => `${relative(ROOT, file)}:${line}  ${call}`,
      ),
    );
    expect(
      report,
      'Revalidate a route group\'s layout instead, e.g. revalidatePath("/(app)", "layout")',
    ).toEqual([]);
  });

  it("recognizes the calls that reach that tag", () => {
    for (const call of [
      'revalidatePath("/", "layout")',
      "revalidatePath('/','layout')",
      "revalidatePath(`/`, `layout`)",
      'revalidatePath("", "layout")',
      'revalidatePath(\n    "/",\n    "layout",\n  )',
      'revalidateTag("_N_T_/layout")',
      'revalidateTag("_N_T_/layout", "max")',
      'updateTag("_N_T_/layout")',
    ]) {
      expect(rootLayoutRevalidations(call), call).toHaveLength(1);
    }
    for (const call of [
      'revalidatePath("/(app)", "layout")',
      'revalidatePath("/")',
      'revalidatePath("/group")',
      "revalidatePath(`/meetings/${meetingId}`)",
      'revalidateTag("meals")',
    ]) {
      expect(rootLayoutRevalidations(call), call).toEqual([]);
    }
  });
});
