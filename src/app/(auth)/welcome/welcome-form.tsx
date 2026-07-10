"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

export function WelcomeForm({ next }: { next: string }) {
  const [name, setName] = useState("");
  const router = useRouter();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    await authClient.updateUser({ name: trimmed });
    router.push(next);
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
      <Button type="submit" size="lg" className="min-h-tap w-full font-bold">
        Continue
      </Button>
    </form>
  );
}
