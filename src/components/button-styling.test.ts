import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Every tappable action goes through <Button> or buttonVariants() (see
// src/components/ui/button.tsx), so none of them render as floating text.
// This scans the source for interactive elements styled any other way.

const ROOT = join(__dirname, "..", "..");
const SRC = join(ROOT, "src");

// Controls with their own affordance, which are not buttons in the Button
// sense. The count is exact, so a new raw button in one of these files (or a
// stale entry) still fails.
const ALLOWED: Record<string, { count: number; why: string }> = {
  "src/components/prayer-compose.tsx": { count: 1, why: "the include-my-name switch" },
  "src/components/appearance-card.tsx": { count: 1, why: "the segmented theme picker" },
  "src/components/recipe-picker.tsx": { count: 1, why: "tappable recipe list rows" },
  "src/components/tab-bar.tsx": { count: 1, why: "the tab bar" },
  "src/components/meeting-row.tsx": { count: 1, why: "a tappable meeting card" },
  "src/components/note-list.tsx": { count: 1, why: "a tappable note card" },
  "src/app/(app)/recipes/page.tsx": { count: 1, why: "a tappable recipe card" },
  "src/components/group-switcher.tsx": { count: 1, why: "the page title, with its chevron" },
  "src/components/notifications-card.tsx": { count: 1, why: "the notifications switch" },
};

const INTERACTIVE = /<(button|Link|DialogTrigger|DropdownMenuTrigger|DialogClose)(?=[\s/>])/g;

// The opening tag starting at `start`: up to the first `>` outside braces and
// string literals, so `render={<Button />}` stays inside it.
function openingTag(source: string, start: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = start + 1; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (depth === 0 && (ch === '"' || ch === "'")) {
      quote = ch;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
    } else if (ch === ">" && depth === 0) {
      return source.slice(start, i + 1);
    }
  }
  return source.slice(start);
}

function unstyledInteractiveElements(source: string): { line: number; tag: string }[] {
  const found: { line: number; tag: string }[] = [];
  for (const match of source.matchAll(INTERACTIVE)) {
    // `render={<Link />}` takes its styling from the element rendering it.
    if (source.slice(0, match.index).trimEnd().endsWith("render={")) continue;
    const tag = openingTag(source, match.index);
    // A <Button> inside the opening tag can only be a prop, i.e. render={...}.
    const styled = match[1] !== "button" && (/<Button\b/.test(tag) || /buttonVariants\(/.test(tag));
    if (!styled) {
      found.push({
        line: source.slice(0, match.index).split("\n").length,
        tag: tag.replace(/\s+/g, " ").slice(0, 100),
      });
    }
  }
  return found;
}

function sourceFiles(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".tsx") && !file.includes(".test."))
    .map((file) => join(SRC, file))
    .filter((file) => !relative(SRC, file).startsWith(join("components", "ui")));
}

describe("button styling", () => {
  it("styles every tappable action with Button or buttonVariants", () => {
    const counts: Record<string, number> = {};
    const report: string[] = [];
    for (const file of sourceFiles()) {
      const found = unstyledInteractiveElements(readFileSync(file, "utf8"));
      if (found.length === 0) continue;
      const name = relative(ROOT, file);
      counts[name] = found.length;
      for (const { line, tag } of found) report.push(`${name}:${line}  ${tag}`);
    }

    const allowed = Object.fromEntries(
      Object.entries(ALLOWED).map(([name, { count }]) => [name, count]),
    );
    expect(
      counts,
      `Use <Button> or buttonVariants(), or add a reasoned ALLOWED entry:\n${report.join("\n")}`,
    ).toEqual(allowed);
  });
});
