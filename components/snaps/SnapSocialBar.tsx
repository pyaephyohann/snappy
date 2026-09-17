'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import SnapCommentsSheet from '@/components/snaps/SnapCommentsSheet';
import {
  REACTION_EMOJIS,
  REACTION_TYPES,
  type SnapReactionType,
} from '@/lib/snap-reactions';

interface SocialSummary {
  counts: Record<SnapReactionType, number>;
  total: number;
  commentCount: number;
  myReaction: SnapReactionType | null;
}

interface SnapSocialBarProps {
  snapId: string;
}

export default function SnapSocialBar({ snapId }: SnapSocialBarProps) {
  const [summary, setSummary] = useState<SocialSummary | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadSummary() {
      try {
        const response = await fetch(`/api/snaps/${snapId}/social`, {
          credentials: 'include',
        });
        if (!response.ok) return;
        const result = (await response.json()) as SocialSummary;
        if (!cancelled) setSummary(result);
      } catch {
        // Non-critical: counts stay hidden if summary fails to load.
      }
    }

    void loadSummary();
    return () => {
      cancelled = true;
    };
  }, [snapId]);

  useEffect(() => {
    if (!pickerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        pickerRef.current &&
        !pickerRef.current.contains(e.target as Node)
      ) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [pickerOpen]);

  const applyReaction = useCallback(
    (previous: SnapReactionType | null, next: SnapReactionType | null) => {
      setSummary((current) => {
        if (!current) return current;
        const counts = { ...current.counts };
        let total = current.total;
        if (previous) {
          counts[previous] = Math.max(0, counts[previous] - 1);
          total -= 1;
        }
        if (next) {
          counts[next] = counts[next] + 1;
          total += 1;
        }
        return { ...current, counts, total, myReaction: next };
      });
    },
    [],
  );

  const handleSelectReaction = useCallback(
    async (type: SnapReactionType) => {
      if (pending) return;
      setPickerOpen(false);
      setError(null);

      const previous = summary?.myReaction ?? null;
      const next = previous === type ? null : type;

      // Optimistic update
      applyReaction(previous, next);
      setPending(true);

      try {
        const response = await fetch(`/api/snaps/${snapId}/reaction`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type }),
        });
        const result = (await response.json()) as {
          error?: string;
          reaction?: { type: SnapReactionType } | null;
        };
        if (!response.ok) {
          throw new Error(result.error ?? 'Failed to update reaction');
        }
        // Reconcile with server truth (toggle may remove instead of set).
        const serverNext = result.reaction?.type ?? null;
        if (serverNext !== next) {
          applyReaction(next, serverNext);
        }
      } catch (reactionError) {
        // Rollback optimistic update
        applyReaction(next, previous);
        setError(
          reactionError instanceof Error
            ? reactionError.message
            : 'Failed to update reaction',
        );
      } finally {
        setPending(false);
      }
    },
    [applyReaction, pending, snapId, summary?.myReaction],
  );

  const handleCommentAdded = useCallback(() => {
    setSummary((current) =>
      current
        ? { ...current, commentCount: current.commentCount + 1 }
        : current,
    );
  }, []);

  const myReaction = summary?.myReaction ?? null;
  const total = summary?.total ?? 0;
  const commentCount = summary?.commentCount ?? 0;
  const topReactions = REACTION_TYPES.filter(
    (type) => (summary?.counts[type] ?? 0) > 0,
  ).slice(0, 3);

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <div className="relative" ref={pickerRef}>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              if (myReaction) {
                void handleSelectReaction(myReaction);
              } else {
                setPickerOpen((open) => !open);
              }
            }}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setPickerOpen(true);
            }}
            className={`inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${
              myReaction
                ? 'border-primary/50 bg-primary/10 text-foreground'
                : 'border-border bg-card text-muted-foreground hover:bg-muted'
            }`}
            aria-label={
              myReaction
                ? `Remove your ${myReaction.toLowerCase()} reaction`
                : 'React to this snap'
            }
            aria-pressed={Boolean(myReaction)}
          >
            <span aria-hidden>
              {myReaction ? REACTION_EMOJIS[myReaction] : '👍'}
            </span>
            {total > 0 ? <span>{total}</span> : null}
          </button>

          <AnimatePresence>
            {pickerOpen ? (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 6, scale: 0.9 }}
                transition={{ duration: 0.15 }}
                className="absolute bottom-full left-0 z-20 mb-2 flex items-center gap-1 rounded-full border border-border bg-card p-1.5 shadow-lg"
                onClick={(event) => event.stopPropagation()}
              >
                {REACTION_TYPES.map((type) => (
                  <motion.button
                    key={type}
                    type="button"
                    whileHover={{ scale: 1.25, y: -2 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => void handleSelectReaction(type)}
                    className={`cursor-pointer rounded-full p-1.5 text-xl leading-none transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${
                      myReaction === type ? 'bg-primary/15' : 'hover:bg-muted'
                    }`}
                    aria-label={`React with ${type.toLowerCase()}`}
                    aria-pressed={myReaction === type}
                  >
                    <span aria-hidden>{REACTION_EMOJIS[type]}</span>
                  </motion.button>
                ))}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </div>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setCommentsOpen(true);
          }}
          className="inline-flex min-h-[36px] cursor-pointer items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="View comments"
        >
          <span aria-hidden>💬</span>
          {commentCount > 0 ? <span>{commentCount}</span> : null}
        </button>

        {topReactions.length > 0 ? (
          <span
            className="ml-1 text-xs text-muted-foreground"
            aria-label="Reaction summary"
          >
            {topReactions.map((type) => REACTION_EMOJIS[type]).join(' ')}
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="mt-1 text-[11px] text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <SnapCommentsSheet
        snapId={snapId}
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        onCommentAdded={handleCommentAdded}
      />
    </div>
  );
}
