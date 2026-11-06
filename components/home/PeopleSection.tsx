"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import FriendCard from "@/components/home/FriendCard";
import { readNextUserListCursor } from "@/lib/user-list";
import type { RelationshipUser } from "@/lib/relationships";

interface PeopleSectionProps {
  /** First page of active Snappy users (server-rendered, viewer excluded). */
  people: RelationshipUser[];
  /** Cursor for the next page from `listUsersForViewerPage`, if any. */
  nextCursor?: string | null;
  showViewAllLink?: boolean;
}

/**
 * Home directory of everyone on Snappy — not just mutual friends. The server
 * renders the first page (no loading flash); further pages come from the
 * existing `/api/users/list` endpoint so the section can reach every account
 * without an unbounded first query.
 */
export default function PeopleSection({
  people,
  nextCursor: initialNextCursor = null,
  showViewAllLink = true,
}: PeopleSectionProps) {
  const [allPeople, setAllPeople] = useState(people);
  const [nextCursor, setNextCursor] = useState(initialNextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setLoadError(null);

    try {
      const response = await fetch(
        `/api/users/list?excludeSelf=1&cursor=${encodeURIComponent(nextCursor)}`,
        { credentials: "include" },
      );
      if (!response.ok) {
        throw new Error(`People page failed with ${response.status}`);
      }

      const page = (await response.json()) as RelationshipUser[];
      setAllPeople((current) => {
        const seen = new Set(current.map((person) => person.id));
        return [
          ...current,
          ...page.filter((person) => {
            if (seen.has(person.id)) return false;
            seen.add(person.id);
            return true;
          }),
        ];
      });
      setNextCursor(readNextUserListCursor(response));
    } catch {
      setLoadError("Could not load more people.");
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, nextCursor]);

  return (
    <section className="mb-8 sm:mb-10" aria-labelledby="home-people-heading">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2
          id="home-people-heading"
          className="text-xl font-semibold text-foreground sm:text-2xl"
        >
          People
        </h2>
        {showViewAllLink ? (
          <Link
            href="/search"
            className="shrink-0 cursor-pointer text-sm font-medium text-primary hover:opacity-90"
          >
            View All →
          </Link>
        ) : null}
      </div>

      {allPeople.length > 0 ? (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-6 lg:grid-cols-4 xl:grid-cols-5">
            {allPeople.map((person) => (
              <FriendCard
                key={person.id}
                name={person.name}
                profileImage={person.profileImage}
                priority={false}
              />
            ))}
          </div>

          {nextCursor ? (
            <div className="mt-5 flex flex-col items-center gap-2 text-center">
              {loadError ? (
                <p className="text-sm text-destructive" role="alert">
                  {loadError}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loadingMore}
                className="min-h-[44px] cursor-pointer rounded-xl border border-border bg-card px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingMore
                  ? "Loading…"
                  : loadError
                    ? "Try again"
                    : "Show more people"}
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="rounded-xl border border-border bg-card p-6 text-center shadow-sm sm:p-8">
          <p className="text-sm font-medium text-foreground">No people yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Everyone who joins Snappy will show up here.
          </p>
        </div>
      )}
    </section>
  );
}
