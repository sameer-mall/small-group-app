import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { avatarsEnabled } from "@/lib/avatar-storage";
import { safeNextPath } from "@/lib/utils";
import { AvatarPicker } from "@/components/avatar-picker";
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

  // The photo is optional, and saved the moment the crop is confirmed, so a
  // member who stops here still has it next time. A Google photo shows when
  // there is one. With photos off and nothing to show, the screen is just
  // the heading and the form.
  const showPhoto = avatarsEnabled || Boolean(session.user.image);
  const heading = (
    <div className="mx-auto w-full max-w-sm text-center">
      <h1 className="font-serif text-3xl font-semibold">Welcome</h1>
      <p className="text-muted-foreground mt-2">
        What should the group call you? Your name shows on meal claims and prayers.
      </p>
    </div>
  );

  return (
    <main className="flex min-h-dvh flex-col bg-background">
      {showPhoto ? (
        <AvatarPicker
          name=""
          image={session.user.image ?? null}
          enabled={avatarsEnabled}
          layout="page"
          hint="So the group knows your face. Optional."
        >
          {heading}
        </AvatarPicker>
      ) : (
        <div className="px-6 pt-16">{heading}</div>
      )}
      <div className="px-6 pt-6 pb-6">
        <WelcomeForm next={safeNext} />
      </div>
    </main>
  );
}
