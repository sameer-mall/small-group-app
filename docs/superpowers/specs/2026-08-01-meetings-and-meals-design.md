# Meetings & Meal Sign-ups — Plan 3 Design

**Date:** 2026-08-01
**Status:** Approved design, pre-implementation
**Parent spec:** [2026-07-02-small-group-pwa-design.md](2026-07-02-small-group-pwa-design.md) — the data model, feature behaviors, and edge cases live there and are not restated here. This document records what plan 3 does and does not build, and the decisions the parent spec left open.

## Goal

Ship the app's headline ritual end to end: a group creates weekly meetings, saves reusable recipes, sets a week's meal from one, and members claim the individual items they'll bring.

## Scope

**In:**

- **Meetings hub.** Any member creates a meeting (title + date). Upcoming and past meetings list. Meeting detail page. Creator or an admin can edit or delete; deletion warns that the meeting's content goes with it.
- **Recipe library.** Group-shared: any member creates, edits, and deletes recipes (name + ordered items).
- **Meal sign-ups.** Set a meeting's meal by picking a recipe (its items are *copied* into the plan). Claim and release item slots. Add ad-hoc items. Change the recipe after claims exist (warns, then clears and reloads).

**Out — deferred to later plans:**

- **Prayer bowl** → plan 4. **Private notes** → plan 5.
- The meeting detail page in plan 3 renders **the meal section only**. No placeholder sections for prayer or notes; those plans add their sections when they land. (Decision: unlike plan 2's tab bar, this page is not shipped in its final shape.)

## Decisions this plan makes

1. **Meal-only meeting page** (above) — plans 4 and 5 extend the page rather than fill reserved slots.
2. **Recipes are group-shared, not personal.** Any member may edit or delete any recipe in their group, per the parent spec. No per-recipe ownership beyond `created_by` for display.
3. **Meetings list ordering:** upcoming meetings first, soonest at top; past meetings below, most recent first. A meeting is "past" when its date is before today (dates are date-only).
4. **Recipes tab replaces its placeholder.** `/recipes` currently renders a "coming soon" screen from plan 2; plan 3 replaces it with the real library.

## Architecture

Follows plan 2's established layering exactly — no new patterns.

- **Tables** (parent spec, Data model): `meetings`, `recipes`, `recipe_items`, `meal_plans`, `meal_plan_items`, `item_claims`. Drizzle migrations, generated not hand-written.
- **Domain modules** hold all logic and are directly testable: `src/lib/meetings.ts`, `src/lib/recipes.ts`, `src/lib/meals.ts`. They take explicit actor ids, never read headers, and throw the established error vocabulary (`forbidden`, `not-found`, plus new cases below).
- **DAL guards** (`src/lib/dal.ts`) gate every route: `requireMember(groupId)` for reads and member actions; creator-or-admin checks for meeting edit/delete. The authorization rule is unchanged — every query and mutation is scoped by group membership server-side.
- **Server actions stay thin:** resolve the actor, call the domain, map errors to copy, revalidate.
- **Error vocabulary additions:** `already-claimed` (lost a claim race), `not-claimed` (releasing something you don't hold). Mapped to user copy in the actions layer.

**Permissions** (from the parent spec, made explicit because they drive the guards):

| Action | Who |
|---|---|
| Create a meeting; set or change its meal; add ad-hoc items; claim/release items | Any member of the group |
| Create, edit, delete recipes | Any member of the group |
| Edit or delete a meeting | Its creator, or an admin |
| Remove an ad-hoc item (while unclaimed) | The member who added it, or an admin |
| Release a claim | The claimer only |

**Claim integrity:** a unique constraint on `item_claims.meal_plan_item` makes one-claimer-per-item a database guarantee, not application logic. The loser of a race gets `already-claimed` and a refreshed list.

**Copy-on-set:** selecting a recipe copies its items into `meal_plan_items` (with `source: 'recipe'`). Later edits to the recipe never rewrite past weeks. Ad-hoc items (`source: 'adhoc'`) exist only on that plan and record who added them.

## Screens and routing

Hearth screens per `docs/design/hearth/README.md` (mockups not vendored; the README's screen inventory and interaction notes are the in-repo reference).

| Route | Screen | Notes |
|---|---|---|
| `/` (Meetings tab) | **3d** meetings list, **3e** empty state | Replaces plan 2's `MeetingsEmpty` placeholder |
| `/` + new-meeting sheet | **3f** | Bottom sheet: title + date |
| `/meetings/[id]` | meal portion of **3n** / **3g** | Meal section only this plan |
| `/recipes` | **3i** library | Replaces plan 2's "coming soon" |
| `/recipes/[id]` | **3j** detail | |
| `/recipes/new` | **3k** form | |

**Meal slot states** (3n): unclaimed shows a dashed avatar + terracotta "Claim" pill; claimed by you shows a "Release" link; claimed by others shows their name. Ad-hoc items note "added by \<name\>".

## Mobile-first requirements

The parent spec's [Mobile-first experience](2026-07-02-small-group-pwa-design.md#mobile-first-experience) section is binding. These are its concrete obligations in this plan, baked into the tasks that build each flow rather than deferred to a polish pass:

- **Claim/release is optimistic.** The slot flips state on tap; a server rejection rolls it back with the mapped message and refreshed data. This is a requirement of the claim task itself — it changes how the action is written and cannot be retrofitted cheaply.
- **The meeting page refetches on focus,** so a phone returning from the background never shows stale claim state.
- **The new-meeting sheet uses `<input type="date">`** for the OS picker.
- **The recipe form is keyboard-aware:** adding items in sequence flows with the on-screen keyboard (`enterKeyHint`), and the active field never hides behind the keyboard or the fixed tab bar.
- **Long labels wrap** in meal slots and meeting rows; claim controls stay reachable.
- **Delete-meeting and change-recipe-after-claims** confirms keep the destructive control clear of the opening button's tap path.

Every task that ships UI verifies its behavior at a phone viewport before it is considered done.

## Testing

- **Vitest integration** (Docker Postgres): recipe CRUD; setting a meal copies items; changing the recipe clears claims; **claim uniqueness under contention** (concurrent claims on one item — exactly one wins); release; ad-hoc add/remove rules.
- **Playwright smoke:** set a meal and claim items, end to end.
- Green at every commit: `lint`, `typecheck`, `test`, `build`; e2e where the task says so. Trunk-based, one PR per task.

## Out of scope

Everything the parent spec lists as out of scope for v1 — notably item quantities and multi-person claims per item, and saving ad-hoc items back into the recipe. Plus, for this plan specifically: prayer sessions and notes (plans 4 and 5).
