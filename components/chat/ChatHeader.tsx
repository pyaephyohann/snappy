"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ChatParticipant } from "@/lib/chat-client";

export default function ChatHeader({
  participant,
  profilePrefix = "/friends",
  backHref,
}: {
  participant: ChatParticipant;
  profilePrefix?: string;
  backHref?: string;
}) {
  const router = useRouter();
  return (
    <header className="flex min-h-[64px] shrink-0 items-center gap-3 border-b border-border bg-card/95 px-3 backdrop-blur-sm sm:px-5">
      <button type="button" onClick={() => (backHref ? router.push(backHref) : router.back())} className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring" aria-label="Go back to conversations">
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
      </button>
      <Link href={`${profilePrefix}/${encodeURIComponent(participant.name)}`} className="flex min-w-0 items-center gap-3 rounded-xl px-1 py-1 focus-visible:ring-2 focus-visible:ring-ring">
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full border border-border">
          <Image src={participant.profileImage} alt="" fill sizes="40px" className="object-cover" />
        </div>
        <span className="min-w-0 truncate text-sm font-semibold text-foreground">{participant.name}</span>
      </Link>
    </header>
  );
}
