// Autosave for a text field, kept free of React and the server so its timing
// rules can be unit-tested with fake timers. The caller feeds it every change;
// it waits for typing to pause, sends one save at a time and in order (so an
// older text can never land after a newer one), and keeps whatever failed so
// the next attempt retries it.

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export type Autosaver = {
  // Call on every change. Saves `delayMs` after the last call.
  schedule(value: string): void;
  // Saves now — on blur, when the tab is hidden, when leaving the page. If a
  // save is already out, resolves once it and anything typed during it have
  // landed. Never rejects: failures are reported through onStatus.
  flush(): Promise<void>;
  // True while text is waiting, being sent, or kept after a failure.
  hasUnsaved(): boolean;
};

export function createAutosaver(options: {
  // Rejects to signal the save failed.
  save: (value: string) => Promise<void>;
  delayMs: number;
  onStatus: (status: SaveStatus) => void;
}): Autosaver {
  let timer: ReturnType<typeof setTimeout> | null = null;
  // The newest text not yet handed to save(); null when there is none.
  let pending: string | null = null;
  let inFlight: Promise<void> | null = null;

  function run(): Promise<void> {
    if (pending === null) return Promise.resolve();
    const value = pending;
    pending = null;
    options.onStatus("saving");
    inFlight = options.save(value).then(
      () => {
        inFlight = null;
        // Typed while that save was out: send it now, in order.
        if (pending !== null) return run();
        options.onStatus("saved");
      },
      () => {
        inFlight = null;
        // Keep the failed text for the retry — unless newer text has already
        // replaced it, in which case the retry sends that instead.
        if (pending === null) pending = value;
        options.onStatus("error");
      },
    );
    return inFlight;
  }

  function flush(): Promise<void> {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    // One save at a time: if one is out, the newest text follows it when it
    // lands (run() picks `pending` up).
    return inFlight ?? run();
  }

  function schedule(value: string) {
    pending = value;
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void flush();
    }, options.delayMs);
  }

  return {
    schedule,
    flush,
    hasUnsaved: () => pending !== null || inFlight !== null,
  };
}
