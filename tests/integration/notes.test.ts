import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { approveRequest, createGroup, getInviteCode, removeMember, requestToJoin } from "@/lib/groups";
import { createMeeting, deleteMeeting, updateMeeting } from "@/lib/meetings";
import { deleteMyNote, getMyNote, getMyNoteById, listMyNotes, saveMyNote, updateMyNote } from "@/lib/notes";

async function mkUser(id: string, name = id) {
  await db.execute(sql`insert into "user" (id, name, email, email_verified, created_at, updated_at)
    values (${id}, ${name}, ${id + "@example.com"}, true, now(), now()) on conflict do nothing`);
  return id;
}

// Adds `userId` to `groupId` as a plain member via the real join flow.
async function addMember(adminId: string, groupId: string, userId: string) {
  await requestToJoin(userId, await getInviteCode(groupId));
  const [req] = (await db.execute(
    sql`select id from join_requests where group_id = ${groupId} and user_id = ${userId} and status = 'pending'`,
  )).rows as { id: string }[];
  await approveRequest(adminId, req.id);
}

async function noteRows(meetingId: string) {
  return (await db.execute(sql`select author_id from notes where meeting_id = ${meetingId}`))
    .rows as { author_id: string }[];
}

describe("notes", () => {
  let alice: string, bob: string, outsider: string;
  beforeAll(async () => {
    alice = await mkUser(`u_n_alice_${crypto.randomUUID()}`, "Alice");
    bob = await mkUser(`u_n_bob_${crypto.randomUUID()}`, "Bob");
    outsider = await mkUser(`u_n_out_${crypto.randomUUID()}`, "Outsider");
  });

  // Alice (admin) and Bob (member), and one meeting.
  async function seedMeeting(name: string) {
    const { groupId } = await createGroup(alice, name);
    await addMember(alice, groupId, bob);
    const { meetingId } = await createMeeting(alice, groupId, { title: name, date: "2026-10-08" });
    return { groupId, meetingId };
  }

  it("a meeting with no note reads as empty, and reading writes nothing", async () => {
    const { meetingId } = await seedMeeting("Untouched");
    expect(await getMyNote(alice, meetingId)).toBe("");
    expect(await noteRows(meetingId)).toHaveLength(0);
  });

  it("saving writes your note, and saving again replaces it", async () => {
    const { meetingId } = await seedMeeting("Replace");
    await saveMyNote(alice, meetingId, "first thought");
    await saveMyNote(alice, meetingId, "second thought");
    expect(await getMyNote(alice, meetingId)).toBe("second thought");
    expect(await noteRows(meetingId)).toHaveLength(1);
  });

  it("keeps the note exactly as typed — autosave fires mid-sentence", async () => {
    const { meetingId } = await seedMeeting("As typed");
    const typed = "  v. 28 — all things\n\nwork together ";
    await saveMyNote(alice, meetingId, typed);
    expect(await getMyNote(alice, meetingId)).toBe(typed);
  });

  it("each member reads only their own note — the admin included", async () => {
    const { groupId, meetingId } = await seedMeeting("Private");
    await saveMyNote(alice, meetingId, "Alice's private note");
    await saveMyNote(bob, meetingId, "Bob's private note");

    expect(await getMyNote(alice, meetingId)).toBe("Alice's private note");
    expect(await getMyNote(bob, meetingId)).toBe("Bob's private note");
    // Alice is the group's admin, and still never sees Bob's words.
    const aliceList = await listMyNotes(alice, groupId);
    expect(aliceList.map((n) => n.body)).toEqual(["Alice's private note"]);
    expect(JSON.stringify(aliceList)).not.toContain("Bob's private note");
    expect((await listMyNotes(bob, groupId)).map((n) => n.body)).toEqual(["Bob's private note"]);
  });

  it("clearing a note deletes it, so the history never lists a blank", async () => {
    const { groupId, meetingId } = await seedMeeting("Cleared");
    await saveMyNote(alice, meetingId, "temporary");
    await saveMyNote(alice, meetingId, "  \n\t ");
    expect(await noteRows(meetingId)).toHaveLength(0);
    expect(await getMyNote(alice, meetingId)).toBe("");
    expect(await listMyNotes(alice, groupId)).toEqual([]);
  });

  it("clearing a note that was never written is harmless", async () => {
    const { meetingId } = await seedMeeting("Never written");
    await saveMyNote(alice, meetingId, "");
    expect(await noteRows(meetingId)).toHaveLength(0);
  });

  it("only group members can read or write notes on a meeting", async () => {
    const { groupId, meetingId } = await seedMeeting("Outsiders");
    await expect(getMyNote(outsider, meetingId)).rejects.toThrow("forbidden");
    await expect(saveMyNote(outsider, meetingId, "sneaky")).rejects.toThrow("forbidden");
    await expect(listMyNotes(outsider, groupId)).rejects.toThrow("forbidden");
    expect(await noteRows(meetingId)).toHaveLength(0);
  });

  it("a meeting that doesn't exist is not-found", async () => {
    await expect(getMyNote(alice, crypto.randomUUID())).rejects.toThrow("not-found");
    await expect(saveMyNote(alice, crypto.randomUUID(), "x")).rejects.toThrow("not-found");
  });

  it("a removed member can no longer reach their notes", async () => {
    const { groupId, meetingId } = await seedMeeting("Removed");
    await saveMyNote(bob, meetingId, "Bob's note");
    await removeMember(alice, groupId, bob);
    await expect(getMyNote(bob, meetingId)).rejects.toThrow("forbidden");
    await expect(listMyNotes(bob, groupId)).rejects.toThrow("forbidden");
  });

  it("lists your notes in this group only, newest meeting first", async () => {
    const { groupId } = await createGroup(alice, "History");
    const early = await createMeeting(alice, groupId, { title: "Early", date: "2026-09-01" });
    const sameA = await createMeeting(alice, groupId, { title: "Same day A", date: "2026-09-08" });
    const sameB = await createMeeting(alice, groupId, { title: "Same day B", date: "2026-09-08" });
    const late = await createMeeting(alice, groupId, { title: "Late", date: "2026-09-15" });
    await createMeeting(alice, groupId, { title: "No note", date: "2026-09-22" });
    // Written in this order, so on the shared date B's note is the later one.
    for (const m of [early, sameA, sameB, late]) await saveMyNote(alice, m.meetingId, "note");

    // A note in another of Alice's groups stays out of this list.
    const other = await createGroup(alice, "Other group");
    const elsewhere = await createMeeting(alice, other.groupId, { title: "Elsewhere", date: "2026-09-30" });
    await saveMyNote(alice, elsewhere.meetingId, "note");

    const list = await listMyNotes(alice, groupId);
    expect(list.map((n) => n.meetingTitle)).toEqual(["Late", "Same day B", "Same day A", "Early"]);
    expect(list[0]).toEqual({
      noteId: expect.any(String),
      meetingId: late.meetingId,
      meetingTitle: "Late",
      meetingDate: "2026-09-15",
      body: "note",
    });
  });

  it("shows a renamed or moved meeting's current title and date", async () => {
    const { groupId, meetingId } = await seedMeeting("Old title");
    await saveMyNote(alice, meetingId, "note");
    await updateMeeting(alice, meetingId, { title: "New title", date: "2026-10-15" });
    const [note] = await listMyNotes(alice, groupId);
    expect(note).toMatchObject({ meetingTitle: "New title", meetingDate: "2026-10-15" });
  });

  it("deleting a meeting keeps everyone's notes on it, with the meeting's title and date", async () => {
    const { groupId, meetingId } = await seedMeeting("Deleted later");
    await saveMyNote(alice, meetingId, "Alice's");
    await saveMyNote(bob, meetingId, "Bob's");
    await deleteMeeting(alice, meetingId);

    expect(await listMyNotes(alice, groupId)).toEqual([
      {
        noteId: expect.any(String),
        meetingId: null,
        meetingTitle: "Deleted later",
        meetingDate: "2026-10-08",
        body: "Alice's",
      },
    ]);
    expect((await listMyNotes(bob, groupId)).map((n) => n.body)).toEqual(["Bob's"]);
    // The meeting itself is gone, so its page can't be read or written.
    await expect(getMyNote(alice, meetingId)).rejects.toThrow("not-found");
  });

  it("a deleted meeting's note keeps its place in the history by date", async () => {
    const { groupId } = await createGroup(alice, "Ordering");
    const before = await createMeeting(alice, groupId, { title: "Before", date: "2026-09-01" });
    const gone = await createMeeting(alice, groupId, { title: "Gone", date: "2026-09-08" });
    const after = await createMeeting(alice, groupId, { title: "After", date: "2026-09-15" });
    for (const m of [before, gone, after]) await saveMyNote(alice, m.meetingId, "note");
    await deleteMeeting(alice, gone.meetingId);

    const list = await listMyNotes(alice, groupId);
    expect(list.map((n) => [n.meetingTitle, n.meetingId === null])).toEqual([
      ["After", false],
      ["Gone", true],
      ["Before", false],
    ]);
  });

  describe("by id, for a note whose meeting was deleted", () => {
    // A note Bob wrote and Alice (the admin) deleted the meeting under.
    async function seedOrphan(name: string) {
      const { groupId, meetingId } = await seedMeeting(name);
      await saveMyNote(bob, meetingId, "Bob's kept note");
      await deleteMeeting(alice, meetingId);
      const [note] = await listMyNotes(bob, groupId);
      return { groupId, noteId: note.noteId };
    }

    it("its author can read, edit, and delete it", async () => {
      const { groupId, noteId } = await seedOrphan("Orphan");
      expect(await getMyNoteById(bob, noteId)).toEqual({
        noteId,
        meetingId: null,
        meetingTitle: "Orphan",
        meetingDate: "2026-10-08",
        body: "Bob's kept note",
      });

      await updateMyNote(bob, noteId, "Bob's edited note");
      expect((await getMyNoteById(bob, noteId)).body).toBe("Bob's edited note");

      await deleteMyNote(bob, noteId);
      expect(await listMyNotes(bob, groupId)).toEqual([]);
      await expect(getMyNoteById(bob, noteId)).rejects.toThrow("not-found");
    });

    it("nobody else can reach it by id — not the admin, not an outsider — and its existence isn't confirmed", async () => {
      const { noteId } = await seedOrphan("Someone else's");
      for (const intruder of [alice, outsider]) {
        await expect(getMyNoteById(intruder, noteId)).rejects.toThrow("not-found");
        await expect(updateMyNote(intruder, noteId, "overwritten")).rejects.toThrow("not-found");
        await expect(deleteMyNote(intruder, noteId)).rejects.toThrow("not-found");
      }
      expect((await getMyNoteById(bob, noteId)).body).toBe("Bob's kept note");
    });

    it("a member who has left the group can't reach their own note by id", async () => {
      const { groupId, noteId } = await seedOrphan("Left");
      await removeMember(alice, groupId, bob);
      await expect(getMyNoteById(bob, noteId)).rejects.toThrow("forbidden");
      await expect(updateMyNote(bob, noteId, "x")).rejects.toThrow("forbidden");
      await expect(deleteMyNote(bob, noteId)).rejects.toThrow("forbidden");
    });

    it("an id that doesn't exist is not-found", async () => {
      await expect(getMyNoteById(bob, crypto.randomUUID())).rejects.toThrow("not-found");
    });

    it("a live meeting's note reads by id too, with its meeting", async () => {
      const { groupId, meetingId } = await seedMeeting("Still here");
      await saveMyNote(alice, meetingId, "live");
      const [note] = await listMyNotes(alice, groupId);
      expect(await getMyNoteById(alice, note.noteId)).toMatchObject({ meetingId, body: "live" });
    });
  });
});
