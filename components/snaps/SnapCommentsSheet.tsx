'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { AnimatePresence, motion } from 'framer-motion';
import { MAX_COMMENT_LENGTH } from '@/lib/snap-reactions';

export interface SnapCommentItem {
  id: string;
  content: string;
  createdAt: string;
  user: {
    id: string;
    name: string;
    profileImage: string;
  };
  likeCount: number;
  liked: boolean;
}

interface SnapCommentsSheetProps {
  snapId: string;
  open: boolean;
  onClose: () => void;
  onCommentAdded: () => void;
}

function formatCommentDate(value: string): string {
  const date = new Date(value);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export default function SnapCommentsSheet({
  snapId,
  open,
  onClose,
  onCommentAdded,
}: SnapCommentsSheetProps) {
  const [comments, setComments] = useState<SnapCommentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Portals require a DOM document — only true after client mount.
  const [mounted] = useState(() => typeof document !== 'undefined');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function loadComments() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/snaps/${snapId}/comments`, {
          credentials: 'include',
        });
        const result = (await response.json()) as {
          error?: string;
          comments?: SnapCommentItem[];
        };
        if (cancelled) return;
        if (!response.ok) {
          throw new Error(result.error ?? 'Failed to load comments');
        }
        setComments(result.comments ?? []);
      } catch (loadError) {
        if (cancelled) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Failed to load comments',
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadComments();
    return () => {
      cancelled = true;
    };
  }, [open, snapId]);

  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  const handleSubmit = useCallback(async () => {
    const content = draft.trim();
    if (!content || sending) return;

    setSending(true);
    setError(null);
    try {
      const response = await fetch(`/api/snaps/${snapId}/comments`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      });
      const result = (await response.json()) as {
        error?: string;
        comment?: SnapCommentItem;
      };
      if (!response.ok || !result.comment) {
        throw new Error(result.error ?? 'Failed to post comment');
      }
      setComments((current) => [result.comment!, ...current]);
      setDraft('');
      onCommentAdded();
      inputRef.current?.focus();
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : 'Failed to post comment',
      );
    } finally {
      setSending(false);
    }
  }, [draft, sending, snapId, onCommentAdded]);

  if (!mounted) return null;

  // Rendered at document.body so no ancestor transform/overflow/stacking
  // context (Snap card, viewer, bottom nav) can paint above the composer.
  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className="fixed inset-0 z-[9999]" role="dialog" aria-modal="true" aria-label="Comments">
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60"
            aria-label="Close comments"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
            className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-xl sm:inset-x-auto sm:left-1/2 sm:w-full sm:max-w-lg sm:-translate-x-1/2"
          >
            <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted" />
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-foreground">Comments</h2>
              <button
                type="button"
                onClick={onClose}
                className="cursor-pointer rounded-full p-1.5 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
                aria-label="Close comments"
              >
                <svg
                  className="h-4 w-4 text-foreground"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {loading ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Loading comments…
                </p>
              ) : comments.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No comments yet. Be the first!
                </p>
              ) : (
                <ul className="space-y-4">
                  {comments.map((comment) => (
                    <li key={comment.id} className="flex gap-3">
                      <Image
                        src={comment.user.profileImage}
                        alt={comment.user.name}
                        width={32}
                        height={32}
                        className="h-8 w-8 shrink-0 rounded-full object-cover"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-foreground">
                          @{comment.user.name}
                          <span className="ml-2 font-normal text-muted-foreground">
                            {formatCommentDate(comment.createdAt)}
                          </span>
                        </p>
                        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-foreground">
                          {comment.content}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {error ? (
              <p
                className="border-t border-border bg-destructive/10 px-4 py-2 text-xs text-destructive"
                role="alert"
              >
                {error}
              </p>
            ) : null}

            <form
              className="flex items-center gap-2 border-t border-border bg-card p-3"
              style={{
                paddingBottom:
                  'calc(0.75rem + env(safe-area-inset-bottom, 0px))',
              }}
              onSubmit={(event) => {
                event.preventDefault();
                void handleSubmit();
              }}
            >
              <label htmlFor={`comment-input-${snapId}`} className="sr-only">
                Write a comment
              </label>
              <input
                id={`comment-input-${snapId}`}
                ref={inputRef}
                type="text"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={MAX_COMMENT_LENGTH}
                placeholder="Write a comment..."
                disabled={sending}
                autoComplete="off"
                className="min-h-[44px] min-w-0 flex-1 rounded-full border border-border bg-background px-4 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={sending || draft.trim().length === 0}
                className="min-h-[44px] shrink-0 cursor-pointer rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sending ? 'Sending…' : 'Send'}
              </button>
            </form>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
