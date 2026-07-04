# Handoff: Hearth — church small group PWA theme

## Overview
"Hearth" is a mobile PWA for a church small group: weekly meetings with a meal
sign-up (claim ingredient slots from a shared recipe), an anonymous "prayer
bowl" draw, and private per-meeting notes. Four bottom tabs: **Meetings,
Recipes, My prayers, Group**. The aesthetic is warm, simple, and highly legible
for a mixed-age group: cream + terracotta, serif headings, generous tap targets.

## About the Design Files
The `.dc.html` files in this bundle are **design references created in HTML** —
prototypes showing intended look and behavior, not production code. The task is
to **recreate these designs in the target codebase's environment** (React,
Vue, etc.) using its established patterns — or, if the app doesn't exist yet,
pick an appropriate stack and implement them there. `theme.css` is the
extracted design system and IS intended to be used (or translated into your
token system) directly.

## Fidelity
**High-fidelity.** Colors, type, spacing, radii, and copy are final. Recreate
pixel-perfectly.

## Theme
Everything lives in `theme.css` as CSS custom properties:
- **Fonts**: Lora (headings, titles, prayer-quote text) + Public Sans (body).
  Loaded from Google Fonts.
- **Light mode** on `:root`, **dark mode** under `[data-theme='dark']` —
  a warm brown dark theme (never gray/black), with a brighter "ember"
  terracotta (`--accent-strong: #D98A5C`) for links/active states.
- A "component recipes" comment block documents buttons, inputs, cards,
  tab bar, and toggle specs.

## Screens (see `Small Group PWA.dc.html`, ids 3a–3n + 2a)
- **3a** Sign in — email magic link + Google button
- **3b** Joined via invite — waiting for admin approval
- **3c** Create a group
- **3d** Home — upcoming/past meetings; **3e** empty state; **3f** new-meeting bottom sheet
- **3n** Meeting page — meal sign-up (claim/release/add item) + prayer bowl *waiting* state
- **3g** Meeting — no meal yet + prayer bowl *open* (compose with "include my name" toggle)
- **3h** Meeting — prayer bowl *drawn* (the one request you drew; author name only if opted in)
- **3i** Recipes library; **3j** recipe detail; **3k** new recipe form
- **3l** My prayers — drawn history grouped by week
- **3m** Group — admin view: pending join request approve/deny, invite link copy/rotate, promote/remove
- **2a** Dark-mode reference of the meeting page

`Flow Walkthrough.dc.html` shows the four core flows in order with captions
(joining, starting a group, planning the meal, prayer bowl) — use it to
understand navigation and state transitions.

## Key interactions & behavior
- **Meal slots**: unclaimed shows a dashed avatar + terracotta "Claim" pill;
  claimed by me shows "Release" link; claimed by others shows their name.
  Ad-hoc items note "added by <name>". Recipe items are copied into the
  meeting at selection time (editing a recipe never changes past weeks).
- **Prayer bowl states**: open (compose, editable until draw) → gathering
  (submitted ✓ / waiting on / not joined lists; Draw button with confirm) →
  drawn (each participant sees exactly one request, never their own;
  author shown only if they opted in). Requests are never listed publicly.
- **My note**: private, autosaves ("Saved just now"), "Only you can see this".
- **Admin**: approve/deny join requests, copy/rotate invite link,
  make admin / remove via per-member ⋯ menu (destructive action in
  `--danger`).

## Files
- `theme.css` — design tokens, rewritten as Tailwind v4 CSS (`@theme inline`); paste into `src/app/globals.css` per its header comment
- The full HTML mockups (`Small Group PWA.dc.html`, `Flow Walkthrough.dc.html`, `support.js`) are **not vendored** to keep the repo lean — they live in the Claude Design project and the original export zip (`~/Downloads/Church small group PWA.zip`). The screen inventory and interaction notes above are the in-repo summary.
