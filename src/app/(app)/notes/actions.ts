"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/dal";
import { deleteMyNote, saveMyNote, updateMyNote } from "@/lib/notes";

// A note is stored as typed: line endings normalized, nothing trimmed,
// because autosave fires mid-sentence and trimming would eat a trailing space
// or newline that's still being typed. The field's maxLength stops an
// over-long note in the UI; this is the server's own check.
const noteBody = z
  .string()
  .overwrite((body) => body.replace(/\r\n?/g, "\n"))
  .max(10_000);

// The note page refuses a blank note: deleting there is its own, confirmed
// step, so clearing the field to retype never throws the note away. A refine,
// not .trim().min(1), so the stored text still isn't trimmed.
const keptNoteBody = noteBody.refine((body) => body.trim() !== "");

// Domain functions throw plain Error("forbidden" | "not-found") — see
// src/lib/notes.ts. Autosave shows one "Not saved yet" for any failure, so
// both map to { saved: false }; anything else is a real fault and rethrows.
function isRefusal(err: unknown) {
  return err instanceof Error && (err.message === "forbidden" || err.message === "not-found");
}

// Autosave calls this directly every time typing pauses.
//
// It revalidates only the author's own pages. No other member's screen shows
// this note, but the author's back button can: without revalidation, Next's
// client router cache may restore a meeting page from before this save, and
// the next keystroke would save that stale text over the newer note.
export async function saveNoteAction(meetingId: string, body: string): Promise<{ saved: boolean }> {
  const user = await requireUser();
  const note = noteBody.safeParse(body);
  if (!note.success) return { saved: false };
  try {
    await saveMyNote(user.id, meetingId, note.data);
  } catch (err) {
    if (isRefusal(err)) return { saved: false };
    throw err;
  }
  revalidatePath(`/meetings/${meetingId}`);
  revalidatePath("/notes");
  return { saved: true };
}

export type ActionState = { error: string | null; success: boolean };

// The note page's autosave, for a note whose meeting was deleted. Unlike the
// meeting page, a blank note is refused rather than deleted (keptNoteBody).
export async function updateNoteAction(noteId: string, body: string): Promise<{ saved: boolean }> {
  const user = await requireUser();
  const note = keptNoteBody.safeParse(body);
  if (!note.success) return { saved: false };
  try {
    await updateMyNote(user.id, noteId, note.data);
  } catch (err) {
    if (isRefusal(err)) return { saved: false };
    throw err;
  }
  revalidatePath(`/notes/${noteId}`);
  revalidatePath("/notes");
  return { saved: true };
}

export async function deleteNoteAction(
  noteId: string,
  _prevState: ActionState,
  _formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  try {
    await deleteMyNote(user.id, noteId);
  } catch (err) {
    if (err instanceof Error && err.message === "not-found") {
      return { error: "That note is already gone.", success: false };
    }
    if (err instanceof Error && err.message === "forbidden") {
      return { error: "Only group members can do that.", success: false };
    }
    throw err;
  }
  revalidatePath("/notes");
  // Outside the try: redirect() signals by throwing, and catching that here
  // would turn a successful delete into an error message.
  redirect("/notes");
}
