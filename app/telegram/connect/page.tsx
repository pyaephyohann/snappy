import { redirect } from "next/navigation";
import Link from "next/link";
import { getAuthenticatedAppUser } from "@/lib/auth";
import { isLinkTokenFormatValid } from "@/lib/telegram/link-token";
import TelegramConnectButton from "@/components/telegram/TelegramConnectButton";

type PageProps = {
  searchParams: Promise<{ token?: string; returnTo?: string }>;
};

export default async function TelegramConnectPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const token = params.token?.trim() ?? "";

  if (!isLinkTokenFormatValid(token)) {
    return (
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
        <h1 className="text-xl font-semibold text-foreground">Invalid link</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Request a new connection link from the Snappy Telegram bot with /upload.
        </p>
        <Link href="/login" className="mt-6 text-sm text-primary underline">
          Sign in to Snappy
        </Link>
      </div>
    );
  }

  const user = await getAuthenticatedAppUser();
  if (!user) {
    const returnTo = `/telegram/connect?token=${encodeURIComponent(token)}`;
    redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-12">
      <h1 className="text-xl font-semibold text-foreground">Connect Telegram</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Signed in as <span className="font-medium text-foreground">{user.name}</span>
      </p>
      <div className="mt-8 rounded-2xl border border-border bg-card p-6">
        <TelegramConnectButton linkToken={token} />
      </div>
    </div>
  );
}
