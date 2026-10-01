# Notes — Plan 5 Design

**Date:** 2026-10-01
**Status:** Draft design, pre-implementation
**Parent spec:** [2026-07-02-small-group-pwa-design.md](2026-07-02-small-group-pwa-design.md). The data model, feature behaviors, and edge cases live there and are not restated here. This document records what plan 5 builds, where the parent spec and the Hearth mockups disagree, and the decisions neither of them settles.

## Goal

Ship the third weekly ritual: each member keeps one private note per meeting (the verse that landed, who to check on) that saves itself as they type, and can find every past note again in one place.

## Scope

**In:**

- **My note on the meeting page.** A card below the prayer bowl: one private note per member per meeting, autosaved, with a save status.
- **My notes.** A `/notes` page listing every note you've written in the active group, newest meeting first, each one linking back to its meeting. A note whose meeting has since been deleted stays here too, and opens on its own page where it can still be edited or deleted.
- **E2E smoke** for the parent spec's "write a note".

**Out:**

- Sharing a note, or anyone else (admins included) reading one. The parent spec makes notes private, full stop.
- Rich text, search, and note previews on the meetings list.
- Offline write queueing. The parent spec defers it for all of v1; a note typed with no signal shows *Not saved yet* and retries when it can.

## Where the spec and the mockups disagree

The Hearth mockups (3g, 3n, 3h, 2a) are final for look and copy; the parent spec is final for behavior. They conflict in three places.

1. **The history.** The spec requires "a 'my notes' history" listing notes by meeting. The mockups have no such screen, and their tab bar is fixed at four tabs (Meetings, Recipes, My prayers, Group). **Resolution:** `/notes` is a page, not a tab. It is reached from a **See all my notes ›** link on the note card, the same pattern the drawn bowl uses for *See all my prayers ›*. It is styled after My prayers (3l). Like a meeting page, it marks no tab active.
2. **"Only you can see this".** 3n shows the footer under a written note; 3g (empty note) and 3h do not. **Resolution:** the footer shows whenever the note has text, which is when there is something to be private about.
3. **"Saved just now".** The mockups always show it. **Resolution:** the line reports real state. It is blank until the first save in a visit, then shows *Saving…*, *Saved just now*, or *Not saved yet*.

## Decisions this plan makes

1. **Autosave timing.** A save goes out 1 second after typing pauses. It also goes out at once when the field loses focus, when the tab is hidden (phones background apps constantly), and when you leave the page. Only one save is in flight at a time, and they go in order, so an older text can never land after a newer one. A failed save keeps its text and retries on the next keystroke, blur, or return to the tab.
2. **The timing logic is a pure module.** `src/lib/autosave.ts` knows nothing about React or the server, so the rules above are unit-tested with fake timers rather than discovered in a browser.
3. **The server never overwrites typing.** The meeting page re-renders under the card: on focus, from the bowl's 5-second polling, and after each save. A changed server value replaces the field only while the field is not focused and nothing is unsaved. That is how an edit made on another device shows up, without ever stealing keystrokes.
4. **Each save revalidates only the author's own pages.** `/meetings/{id}` and `/notes` are revalidated so the author's back button and history never show an older note. Without this, Next's client router cache can restore a page from before the save, and the next keystroke would save that stale text over the newer note. No other member's screen shows the note, so nothing else needs refreshing.
5. **An empty note is no note.** Clearing the text (whitespace-only included) deletes the row, so My notes never lists a blank card.
6. **Stored as typed.** Line endings are normalized to `\n`, but nothing is trimmed: a save fires mid-typing, and trimming would discard a trailing space or newline the writer is about to build on. The limit is 10,000 characters.
7. **Privacy is enforced in the domain.** No domain function takes an author id other than the caller's own. `getMyNote` and `listMyNotes` check membership themselves, the same deliberate exception the prayer bowl's reads make.
8. **A note outlives its meeting.** It belongs to its author, not to the meeting. While the meeting exists, the note shows on it, still one per member per meeting (a unique `(meeting_id, author_id)`). Deleting the meeting sets the note's `meeting_id` to null (`ON DELETE SET NULL`) instead of deleting the note. So the note carries what it needs to stand alone: its own id, its `group_id` for scoping, and a snapshot of the meeting's title and date, refreshed on every save. My notes shows the live meeting's title and date while it exists, and the snapshot after it's gone. This diverges from the parent spec's data model, where `notes` hangs off the meeting; that was the owner's call.
9. **My notes is scoped to the active group,** like Meetings, Recipes, and My prayers. Order is newest meeting date first, with the later-started note first on a tie. A note whose meeting was deleted sorts by its snapshot date.
10. **Leaving or being removed hides your notes; it doesn't delete them.** Every read checks current membership. If you rejoin, they come back. Deleting your account deletes them (FK cascade).
11. **Deleting a meeting keeps everyone's notes.** The creator or an admin can delete a meeting, but that never costs anyone their private notes. The delete warning says so. On My notes, a note whose meeting is gone is marked *Meeting deleted* and opens its own page, `/notes/{id}`. That page has the same autosaving note card, under the meeting's title and date, and a **Delete note** button with a confirm. Two rules differ from the meeting page. Clearing the field there doesn't delete the note: deleting is its own confirmed step, so clearing to retype never throws the note away, and the status reads *Empty notes aren't saved*. And a live meeting's note id redirects to its meeting page, where that note belongs.
12. **Notes don't poll.** Nobody else writes your note. The page's existing refresh-on-focus covers editing on two devices.

## Architecture

Plans 3 and 4's layering, unchanged.

- **Table:** `notes`: id, group_id, meeting_id (nullable, set null when the meeting is deleted), meeting_title and meeting_date (snapshot), author_id, body, created_at, updated_at. Unique `(meeting_id, author_id)`. It cascades from users and groups, never from meetings.
- **Domain:** `src/lib/notes.ts` (`getMyNote`, `saveMyNote`, `listMyNotes`), taking explicit actor ids and using `requireMembership` from `src/lib/membership.ts`. The error vocabulary is the existing `forbidden` / `not-found`; nothing new.
- **Pure logic:** `src/lib/autosave.ts`.
- **Actions** in `src/app/(app)/notes/actions.ts`:
  - `saveNoteAction(meetingId, body)`, the meeting page's autosave.
  - `updateNoteAction(noteId, body)`, the note page's autosave, which refuses a blank note.
  - `deleteNoteAction(noteId)`, behind a confirm.

  The card receives its save action bound by the page, so one card serves both pages.
- **By-id domain functions** for notes whose meeting was deleted: `getMyNoteById`, `updateMyNote`, `deleteMyNote`. Someone else's note reads as `not-found`, the same as a missing one, so an id never confirms another member's note exists.
- **UI:** `NoteCard` (client) on the meeting page and the note page; `/notes` with a server-rendered `NoteList`; `/notes/[id]` with `DeleteNoteButton`.

**Permissions:**

| Action | Who |
|---|---|
| Write, edit, or clear your note on a meeting | Any member of the meeting's group |
| Read your own note | You, while a member |
| Read anyone else's note | **Nobody**, admins included |
| Delete a note | Only its author: by clearing it on the meeting page, or with **Delete note** once its meeting is gone |

## Screens and copy

- **Note card** (3n, 3g; dark 2a), the last card on the meeting page. Header row: **My note** (Lora 19px) with the save status right-aligned. Below it, a borderless text field that grows with its content. Footer row: *Only you can see this* when there is text, and *See all my notes ›* right-aligned.
- **My notes** (`/notes`), after 3l: a heading and subtitle, then one card per note. Each card shows the meeting title, its date, and the note, clamped to four lines, and the whole card links to the meeting. A note whose meeting was deleted shows *Meeting deleted* beside the date and links to its own page instead.
- **A deleted meeting's note** (`/notes/{id}`): the meeting's title and long date with *· Meeting deleted*, the note card, and **Delete note** below it. The confirm keeps Cancel focused and on top, as the meeting delete does.

**Copy from the mockups, verbatim:** "My note" · "Saved just now" · "Tap to start a private note…" (the field's placeholder) · "Only you can see this".

**New copy, not in the mockups — please review:**

- "Saving…" · "Not saved yet": the other two save states
- "See all my notes ›": the card's link to the history
- "My notes" · "Your private notes, meeting by meeting": the history page's heading and subtitle
- "No notes yet" · "Write a note on any meeting page and it lands here.": the empty history
- "Meeting deleted": the marker on My notes for a note whose meeting is gone
- "Empty notes aren't saved": the note page's status while its field is blank
- "Delete note" · "Delete this note?" · "Its meeting is already gone, so this is the only copy. It can't be undone." · "That note is already gone."
- The meeting delete warning becomes "Its meal plan, claims, and prayer bowl are deleted with it. Everyone's notes are kept in My notes."

## Mobile-first requirements

- The field is ≥16px (the mockup's 15px yields to the iOS no-zoom rule, as the prayer field's did). It carries `scroll-mb-28` so the keyboard scrolls it clear of the tab bar.
- It grows with its content (`field-sizing: content`, with a minimum height for browsers without it), so a long note never hides inside a tiny scroll box.
- Saving never blocks typing, and a save in flight never disables the field.
- Meeting titles and notes on My notes wrap rather than truncate (note bodies clamp at four lines, and the full text is one tap away).

## Testing

- **Vitest unit:** `autosave.ts`. It waits for a pause, flushes at once, sends one save at a time in order, keeps failed text for retry, and never lets an older failure overwrite newer text.
- **Vitest integration:** `notes.ts`.
  - Reading writes nothing; save and replace; whitespace-only clears.
  - Text is stored as typed.
  - Each member reads only their own note, admins included.
  - Outsiders and removed members are refused.
  - History is group-scoped and newest first, and shows a renamed meeting's new title.
  - Deleting a meeting keeps every note on it, with the meeting's title and date.
  - By id, only the author can read, edit, or delete a note; anyone else gets `not-found`, and a former member gets `forbidden`.
- **Playwright smoke:**
  - Write a note, see *Saved just now*, reload, and it's there.
  - A second member on the same meeting sees an empty note, and the text is absent from their page's HTML.
  - My notes lists it and links back.
  - After the meeting is deleted, My notes still shows the note, marked *Meeting deleted*. It opens on its own page, where an edit saves and survives a reload, and **Delete note** removes it.
