import { Button } from "@/components/ui/button";
import { createGroupAction } from "./actions";

export default function CreateGroupPage() {
  return (
    <main className="flex min-h-[calc(100dvh-5rem)] flex-col justify-center gap-6 p-6">
      <div className="text-center">
        <h1 className="font-serif text-3xl font-semibold">Create a group</h1>
        <p className="text-muted-foreground mt-2">
          Give your group a name. You can invite others once it&apos;s created.
        </p>
      </div>
      <form action={createGroupAction} className="mx-auto flex w-full max-w-sm flex-col gap-3">
        <label className="text-strong text-sm font-medium" htmlFor="name">
          Group name
        </label>
        <input
          id="name"
          name="name"
          required
          placeholder="Thursday night group"
          className="bg-card border-border focus:border-primary rounded-input min-h-tap w-full border-[1.5px] px-4 py-3.5 text-[16px] outline-none"
        />
        <Button type="submit" size="lg" className="min-h-tap w-full font-bold">
          Create group
        </Button>
      </form>
    </main>
  );
}
