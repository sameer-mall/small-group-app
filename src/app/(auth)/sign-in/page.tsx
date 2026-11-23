import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { PASSKEY_COOKIE } from "@/lib/passkeys";
import { passkeyMethod } from "@/lib/passkey-device";
import { safeNextPath } from "@/lib/utils";
import { SignInScreen } from "./sign-in-screen";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });
  const { next } = await searchParams;
  const safeNext = safeNextPath(next);
  if (session) redirect(safeNext);
  const hasPasskey = (await cookies()).has(PASSKEY_COOKIE);
  return (
    <main className="flex min-h-dvh flex-col justify-center gap-8 bg-background p-6">
      <SignInScreen
        next={safeNext}
        method={passkeyMethod(requestHeaders.get("user-agent") ?? "")}
        hasPasskey={hasPasskey}
      />
    </main>
  );
}
