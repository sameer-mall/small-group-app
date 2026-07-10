import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { WelcomeForm } from "./welcome-form";

export default async function WelcomePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  const { next } = await searchParams;
  if (!session) redirect("/sign-in");
  if (session.user.name?.trim()) redirect(next ?? "/");
  return (
    <main className="flex min-h-dvh flex-col justify-center gap-6 bg-background p-6">
      <div className="text-center">
        <h1 className="font-serif text-3xl font-semibold">Welcome</h1>
        <p className="text-muted-foreground mt-2">
          What should the group call you? Your name shows on meal claims and prayers.
        </p>
      </div>
      <WelcomeForm next={next ?? "/"} />
    </main>
  );
}
