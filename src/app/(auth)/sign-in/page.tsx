import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SignInForm } from "./sign-in-form";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  const { next } = await searchParams;
  if (session) redirect(next ?? "/");
  return (
    <main className="flex min-h-dvh flex-col justify-center gap-8 bg-background p-6">
      <div className="text-center">
        <h1 className="font-serif text-3xl font-semibold">Small Group</h1>
        <p className="text-muted-foreground mt-2">
          Meals, prayer, and notes for our weekly small group.
        </p>
      </div>
      <SignInForm next={next ?? "/"} />
    </main>
  );
}
