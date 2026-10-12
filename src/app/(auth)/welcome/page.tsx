import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { avatarsEnabled } from "@/lib/avatar-storage";
import { AvatarPicker } from "@/components/avatar-picker";
import { safeNextPath } from "@/lib/utils";
import { WelcomeForm } from "./welcome-form";

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  const { next } = await searchParams;
  const safeNext = safeNextPath(next);
  if (!session) redirect("/sign-in");
  if (session.user.name?.trim()) redirect(safeNext);
  return (
    <main className="flex min-h-dvh flex-col justify-center gap-6 bg-background p-6">
      <div className="text-center">
        <h1 className="font-serif text-3xl font-semibold">Welcome</h1>
        <p className="text-muted-foreground mt-2">
          What should the group call you? Your name shows on meal claims and prayers.
        </p>
      </div>
      {/* Optional, and saved the moment the crop is confirmed, so a member who
          stops here still has their photo next time. Shows the Google photo
          when there is one. Hidden entirely when photos are off and there is
          nothing to show. */}
      {(avatarsEnabled || session.user.image) && (
        <div className="mx-auto flex w-full max-w-sm flex-col gap-2">
          <AvatarPicker name="" image={session.user.image ?? null} enabled={avatarsEnabled} />
          <p className="text-tertiary text-xs">Add a photo so the group knows your face. Optional.</p>
        </div>
      )}
      <WelcomeForm next={safeNext} />
    </main>
  );
}
