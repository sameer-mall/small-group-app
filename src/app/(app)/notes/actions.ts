"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { saveMyNote } from "@/lib/notes";

const MAX_NOTE_LENGTH = 10_000;

// Domain functions throw plain Error("forbidden" | "not-found") — see
// src/lib/notes.ts. Autosave shows one "Not saved yet" for any failure, so
// both map to { saved: false }; anything else is a real fault and rethrows.
function isRefusal(err: unknown) {
  return err instanceof Error && (err.message === "forbidden" || err.message === "not-found");
}

// Autosave calls this directly every time typing pauses. The note is stored
// as typed — line endings normalized, nothing trimmed — because a save fires
// mid-sentence.
//
// It revalidates only the author's own pages. No other member's screen shows
// this note, but the author's back button can: without revalidation, Next's
// client router cache may restore a meeting page from before this save, and
// the next keystroke would save that stale text over the newer note.
export async function saveNoteAction(meetingId: string, body: string): Promise<{ saved: boolean }> {
  const user = await requireUser();
  const normalized = String(body).replace(/\r\n?/g, "\n");
  // The field's maxLength stops this in the UI; this is the server's own check.
  if (normalized.length > MAX_NOTE_LENGTH) return { saved: false };
  try {
    await saveMyNote(user.id, meetingId, normalized);
  } catch (err) {
    if (isRefusal(err)) return { saved: false };
    throw err;
  }
  revalidatePath(`/meetings/${meetingId}`);
  revalidatePath("/notes");
  return { saved: true };
}
