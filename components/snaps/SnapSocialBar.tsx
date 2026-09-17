'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import SnapCommentsSheet from '@/components/snaps/SnapCommentsSheet';
import SnapReactionsSheet from '@/components/snaps/SnapReactionsSheet';
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
  /** Share handler — when provided, a Share action is rendered. */
  onShare?: () => void;
  /** Extra classes for the root container. */
  className?: string;
}

const REACTION_LABELS: Record<SnapReactionType, string> = {
  LIKE: 'Like',
  LOVE: 'Love',
  HAHA: 'Haha',
  WOW: 'Wow',
  SAD: 'Sad',
  ANGRY: 'Angry',
};

function LikeIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      className="h-4 w-4"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"
      />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4-.849L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
      />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
      />
    </svg>
  );
}

export default function SnapSocialBar({
  snapId,
  onShare,
  className = '',
}: SnapSocialBarProps) {
  const [summary, setSummary] = useState<SocialSummary | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerPos, setPickerPos] = useState<{ left: number; top: number }>({
    left: 0,
    top: 0,
  });
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Portals require a DOM document — only true after client mount.
  const [mounted] = useState(() => typeof document !== 'undefined');
  const likeButtonRef = useRef<HTMLButtonElement>(null);

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

  const openPicker = useCallback(() => {
    const anchor = likeButtonRef.current;
    if (anchor) {
      const rect = anchor.getBoundingClientRect();
      const pickerWidth = 6 * 44; // six ~44px emoji targets
      const left = Math.min(
        Math.max(8, rect.left),
        Math.max(8, window.innerWidth - pickerWidth - 8),
      );
      setPickerPos({ left, top: rect.top - 8 });
    }
    setPickerOpen(true);
  }, []);

  useEffect(() => {
    if (!pickerOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        likeButtonRef.current &&
        !likeButtonRef.current.contains(e.target as Node)
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

  const actionCount = onShare ? 3 : 2;

  return (
    <div className={className}>
      {/* Summary row */}
      {total > 0 || commentCount > 0 ? (
        <div className="flex items-center justify-between px-1 pb-2 text-xs text-muted-foreground">
          {total > 0 ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setReactionsOpen(true);
              }}
              className="flex cursor-pointer items-center gap-1.5 rounded hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              aria-label={`Show ${total} ${total === 1 ? 'reaction' : 'reactions'}`}
            >
              {topReactions.length > 0 ? (
                <span aria-hidden className="flex items-center gap-0.5">
                  {topReactions.map((type) => (
                    <span key={type}>{REACTION_EMOJIS[type]}</span>
                  ))}
                </span>
              ) : null}
              <span className="hover:underline">
                {total} {total === 1 ? 'reaction' : 'reactions'}
              </span>
            </button>
          ) : (
            <span />
          )}
          {commentCount > 0 ? (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                setCommentsOpen(true);
              }}
              className="cursor-pointer hover:text-foreground hover:underline focus:outline-none focus:ring-2 focus:ring-ring rounded"
              aria-label={`View ${commentCount} comments`}
            >
              {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* Action row */}
      <div
        className="grid gap-1 border-t border-border pt-1"
        style={{
          gridTemplateColumns: `repeat(${actionCount}, minmax(0, 1fr))`,
        }}
      >
        <button
          ref={likeButtonRef}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            if (myReaction) {
              void handleSelectReaction(myReaction);
            } else {
              openPicker();
            }
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            openPicker();
          }}
          className={`inline-flex min-h-[40px] cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${
            myReaction
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground'
          }`}
          aria-label={
            myReaction
              ? `Remove your ${REACTION_LABELS[myReaction].toLowerCase()} reaction`
              : 'React to this snap'
          }
          aria-pressed={Boolean(myReaction)}
        >
          {myReaction ? (
            <span aria-hidden className="text-base leading-none">
              {REACTION_EMOJIS[myReaction]}
            </span>
          ) : (
            <LikeIcon filled={false} />
          )}
          <span>{myReaction ? REACTION_LABELS[myReaction] : 'Like'}</span>
        </button>

        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            setCommentsOpen(true);
          }}
          className="inline-flex min-h-[40px] cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Open comments"
        >
          <CommentIcon />
          <span>Comment</span>
        </button>

        {onShare ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onShare();
            }}
            className="inline-flex min-h-[40px] cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            aria-label="Share this snap"
          >
            <ShareIcon />
            <span>Share</span>
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="mt-1 text-[11px] text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {/* Reaction picker — portaled so card overflow/transform can't clip it */}
      {mounted
        ? createPortal(
            <AnimatePresence>
              {pickerOpen ? (
                <motion.div
                  initial={{ opacity: 0, y: 8, scale: 0.9 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.9 }}
                  transition={{ duration: 0.15 }}
                  className="fixed z-[9999] flex items-center gap-1 rounded-full border border-border bg-card p-1.5 shadow-lg"
                  style={{
                    left: pickerPos.left,
                    top: pickerPos.top,
                    transform: 'translateY(-100%)',
                  }}
                  onClick={(event) => event.stopPropagation()}
                  role="menu"
                  aria-label="Choose a reaction"
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
                      aria-label={`React with ${REACTION_LABELS[type].toLowerCase()}${myReaction === type ? ' (selected)' : ''}`}
                      role="menuitem"
                    >
                      <span aria-hidden>{REACTION_EMOJIS[type]}</span>
                    </motion.button>
                  ))}
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}

      <SnapCommentsSheet
        snapId={snapId}
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        onCommentAdded={handleCommentAdded}
      />

      <SnapReactionsSheet
        snapId={snapId}
        open={reactionsOpen}
        onClose={() => setReactionsOpen(false)}
      />
    </div>
  );
}
