"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { RelationshipState } from "@/lib/relationships";

export default function FollowButton({
  userId,
  initialRelationship,
}: {
  userId: string;
  initialRelationship: RelationshipState;
}) {
  const router = useRouter();
  const [relationship, setRelationship] =
    useState<RelationshipState>(initialRelationship);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggleFollow() {
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/users/${encodeURIComponent(userId)}/follow`, {
        method: relationship.isFollowing ? "DELETE" : "POST",
        credentials: "include",
      });
      const body = (await response.json()) as
        | RelationshipState
        | { error?: string };
      if (!response.ok || !("isFollowing" in body)) {
        throw new Error("error" in body && body.error ? body.error : "Request failed");
      }
      setRelationship(body);
      router.refresh();
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Could not update follow");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-1 sm:items-start">
      <button
        type="button"
        onClick={() => void toggleFollow()}
        disabled={pending}
        className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60 ${
          relationship.isFollowing
            ? "border border-border bg-background text-foreground hover:bg-muted"
            : "bg-primary text-primary-foreground hover:opacity-90"
        }`}
      >
        {pending ? "Updating…" : relationship.isFollowing ? "Following" : "Follow"}
      </button>
      {relationship.isFriend ? (
        <span className="text-xs font-medium text-primary">Friends</span>
      ) : null}
      {error ? (
        <span className="max-w-40 text-center text-xs text-destructive sm:text-left" role="alert">
          {error}
        </span>
      ) : null}
    </div>
  );
}
