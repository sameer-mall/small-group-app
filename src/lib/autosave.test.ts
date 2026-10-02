import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAutosaver, type SaveStatus } from "./autosave";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function harness(save: (value: string) => Promise<void> = () => Promise.resolve()) {
  const statuses: SaveStatus[] = [];
  const spy = vi.fn(save);
  const saver = createAutosaver({ save: spy, delayMs: 1000, onStatus: (s) => statuses.push(s) });
  return { saver, save: spy, statuses };
}

describe("createAutosaver", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits for typing to pause, then saves only the latest text", async () => {
    const { saver, save, statuses } = harness();
    saver.schedule("S");
    await vi.advanceTimersByTimeAsync(400);
    saver.schedule("Sa");
    await vi.advanceTimersByTimeAsync(400);
    saver.schedule("Sar");
    await vi.advanceTimersByTimeAsync(999);
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await saver.flush(); // waits for the save in flight
    expect(save.mock.calls).toEqual([["Sar"]]);
    expect(statuses).toEqual(["saving", "saved"]);
    expect(saver.hasUnsaved()).toBe(false);
  });

  it("flushing saves at once and cancels the pending timer", async () => {
    const { saver, save } = harness();
    saver.schedule("leaving now");
    await saver.flush();
    expect(save.mock.calls).toEqual([["leaving now"]]);

    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flushing with nothing new sends nothing", async () => {
    const { saver, save, statuses } = harness();
    await saver.flush();
    expect(save).not.toHaveBeenCalled();
    expect(statuses).toEqual([]);

    saver.schedule("once");
    await saver.flush();
    await saver.flush();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("sends one save at a time — text typed during a save goes out after it, in order", async () => {
    const first = deferred();
    const { saver, save, statuses } = harness((value) =>
      value === "one" ? first.promise : Promise.resolve(),
    );
    saver.schedule("one");
    const flushing = saver.flush();
    saver.schedule("one two");
    void saver.flush();
    // The second flush must not overtake the first save.
    expect(save.mock.calls).toEqual([["one"]]);
    expect(saver.hasUnsaved()).toBe(true);

    first.resolve();
    await flushing;
    expect(save.mock.calls).toEqual([["one"], ["one two"]]);
    expect(statuses).toEqual(["saving", "saving", "saved"]);
    expect(saver.hasUnsaved()).toBe(false);
  });

  it("a failed save keeps the text, reports it, and the next flush retries it", async () => {
    let offline = true;
    const { saver, save, statuses } = harness(() =>
      offline ? Promise.reject(new Error("offline")) : Promise.resolve(),
    );
    saver.schedule("keep me");
    await saver.flush(); // resolves, never rejects
    expect(statuses).toEqual(["saving", "error"]);
    expect(saver.hasUnsaved()).toBe(true);

    offline = false;
    await saver.flush();
    expect(save.mock.calls).toEqual([["keep me"], ["keep me"]]);
    expect(statuses.at(-1)).toBe("saved");
    expect(saver.hasUnsaved()).toBe(false);
  });

  it("an older failure never overwrites newer text", async () => {
    const first = deferred();
    const { saver, save } = harness((value) => (value === "old" ? first.promise : Promise.resolve()));
    saver.schedule("old");
    const flushing = saver.flush();
    saver.schedule("new");

    first.reject(new Error("offline"));
    await flushing;
    await saver.flush();
    expect(save.mock.calls).toEqual([["old"], ["new"]]);
    expect(saver.hasUnsaved()).toBe(false);
  });
});
