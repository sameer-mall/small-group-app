import { expect, test, type Page } from "@playwright/test";
import { expectApp, memberContext, signIn } from "./helpers";

// iOS 26+ blurs the top of an installed web app, and on iOS 27 the blur
// reaches the Back pill. WebKit skips it when a fixed box with a solid
// background covers the top edge: it hit-tests the middle of the top edge, 4px
// down, ignoring pointer-events, for a fixed or sticky box over 10px tall and
// at least 90% of the viewport wide (LocalFrameView::fixedContainerEdges).
// Chromium can't draw the blur, so this checks for the box WebKit looks for.
async function probeTopEdge(page: Page) {
  return page.evaluate(() => {
    const strip = document.querySelector<HTMLElement>("[data-top-edge]");
    if (!strip) return null;
    // Chromium's hit test honours pointer-events: none; WebKit's probe doesn't.
    strip.style.pointerEvents = "auto";
    const hit = document.elementFromPoint(window.innerWidth / 2, 4);
    strip.style.removeProperty("pointer-events");
    const style = getComputedStyle(strip);
    const rect = strip.getBoundingClientRect();
    return {
      isTopmost: hit === strip,
      position: style.position,
      widthRatio: rect.width / window.innerWidth,
      height: rect.height,
      bottom: rect.bottom,
      background: style.backgroundColor,
      pageBackground: getComputedStyle(document.body).backgroundColor,
      opacity: style.opacity,
      backdropFilter: style.backdropFilter,
      pointerEvents: style.pointerEvents,
      ariaHidden: strip.getAttribute("aria-hidden"),
    };
  });
}

test("a solid strip covers the top edge, so iOS skips its blur", async ({ browser }) => {
  const run = Date.now();
  const page = await (await memberContext(browser)).newPage();
  await page.goto("/sign-in");

  const probe = await probeTopEdge(page);
  expect(probe).not.toBeNull();
  expect(probe!.isTopmost).toBe(true);
  expect(probe!.position).toBe("fixed");
  expect(probe!.widthRatio).toBeGreaterThanOrEqual(0.9);
  expect(probe!.height).toBeGreaterThan(10);
  // Opaque, in the page's own colour, so the status bar matches the page.
  expect(probe!.background).toBe(probe!.pageBackground);
  expect(probe!.background).not.toMatch(/rgba|transparent/);
  expect(probe!.opacity).toBe("1");
  expect(probe!.backdropFilter).toBe("none");
  // Never in the way of a tap or a screen reader.
  expect(probe!.pointerEvents).toBe("none");
  expect(probe!.ariaHidden).toBe("true");

  // It sits above the Back pill, never over it.
  await signIn(page, `top-edge-${run}@example.com`, "Sam");
  await page.getByRole("link", { name: "Create a group" }).click();
  const back = page.getByRole("link", { name: "Back to Meetings" });
  await expectApp(back).toBeVisible();
  const pillTop = (await back.boundingBox())!.y;
  const onAppScreen = await probeTopEdge(page);
  expect(onAppScreen!.isTopmost).toBe(true);
  expect(onAppScreen!.bottom).toBeLessThanOrEqual(pillTop);
});
