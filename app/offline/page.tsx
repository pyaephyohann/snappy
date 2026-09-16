import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Offline — Snappy",
  description: "You are offline. Reconnect to continue using Snappy.",
};

export default function OfflinePage() {
  return (
    <div className="min-h-full flex flex-col items-center justify-center px-6 py-16 bg-background text-foreground">
      {/* eslint-disable-next-line @next/next/no-img-element -- direct /logo.png for offline SW precache */}
      <img
        src="/logo.png"
        alt="Snappy Logo"
        width={96}
        height={96}
        className="w-24 h-24 mb-6"
      />
      <h1 className="text-3xl sm:text-4xl font-bold text-primary caveat-font mb-3 text-center">
        You&apos;re offline
      </h1>
      <p className="text-muted-foreground text-center max-w-md mb-8 leading-relaxed">
        Snappy needs an internet connection for your private feed, friends, and
        snaps. Check your connection and try again.
      </p>
      <Link
        href="/home"
        className="inline-flex items-center justify-center rounded-xl bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
      >
        Try again
      </Link>
    </div>
  );
}
