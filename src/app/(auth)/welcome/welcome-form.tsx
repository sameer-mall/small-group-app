"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient, UNREACHABLE_MESSAGE } from "@/lib/auth-client";

export function WelcomeForm({ next }: { next: string }) {
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setPending(true);
    setError(null);
    try {
      const { error } = await authClient.updateUser({ name: trimmed });
      if (error) {
        setPending(false);
        setError("Couldn't save your name. Try again.");
        return;
      }
      // Stay pending through the navigation so the button can't double-submit.
      router.push(next);
    } catch {
      setPending(false);
      setError(UNREACHABLE_MESSAGE);
    }
  }

  return (
    <form onSubmit={save} className="mx-auto flex w-full max-w-sm flex-col gap-3">
      <label className="text-strong text-sm font-medium" htmlFor="name">
        Display name
      </label>
      <input
        id="name"
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Sam Miller"
        className="bg-card border-border focus:border-primary rounded-input min-h-tap w-full border-[1.5px] px-4 py-3.5 text-[16px] outline-none"
      />
      <Button type="submit" size="block" disabled={pending}>
        Continue
      </Button>
      {error && <p className="text-destructive text-center text-sm">{error}</p>}
    </form>
  );
}
