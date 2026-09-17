'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { AnimatePresence, motion } from 'framer-motion';
import {
  REACTION_EMOJIS,
  REACTION_TYPES,
  type SnapReactionType,
} from '@/lib/snap-reactions';

interface ReactorItem {
  id: string;
  type: string;
  user: {
    id: string;
    name: string;
    profileImage: string;
  };
}

interface SnapReactionsSheetProps {
  snapId: string;
  open: boolean;
  onClose: () => void;
}

export default function SnapReactionsSheet({
  snapId,
  open,
  onClose,
}: SnapReactionsSheetProps) {
  const [activeTab, setActiveTab] = useState<'ALL' | SnapReactionType>('ALL');
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [reactors, setReactors] = useState<ReactorItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted] = useState(() => typeof document !== 'undefined');

  const loadReactors = useCallback(
    async (tab: 'ALL' | SnapReactionType, cursor?: string) => {
      const isLoadMore = Boolean(cursor);
      if (isLoadMore) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      try {
        const params = new URLSearchParams();
        if (tab !== 'ALL') params.set('type', tab);
        if (cursor) params.set('cursor', cursor);

        const response = await fetch(
          `/api/snaps/${snapId}/reactions?${params.toString()}`,
          { credentials: 'include' },
        );
        const result = (await response.json()) as {
          error?: string;
          counts?: Record<string, number>;
          reactions?: ReactorItem[];
          nextCursor?: string | null;
        };
        if (!response.ok) {
          throw new Error(result.error ?? 'Failed to load reactions');
        }
        setCounts(result.counts ?? {});
        setNextCursor(result.nextCursor ?? null);
        setReactors((current) =>
          isLoadMore
            ? [...current, ...(result.reactions ?? [])]
            : (result.reactions ?? []),
        );
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Failed to load reactions',
        );
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [snapId],
  );

  // Reset + load when the sheet transitions from closed to open.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }
    if (wasOpenRef.current) return;
    wasOpenRef.current = true;
    queueMicrotask(() => {
      setActiveTab('ALL');
      setReactors([]);
      setNextCursor(null);
      void loadReactors('ALL');
    });
  }, [open, loadReactors]);

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

  const handleTabChange = useCallback(
    (tab: 'ALL' | SnapReactionType) => {
      if (tab === activeTab) return;
      setActiveTab(tab);
      setReactors([]);
      setNextCursor(null);
      void loadReactors(tab);
    },
    [activeTab, loadReactors],
  );

  if (!mounted) return null;

  const tabs: Array<'ALL' | SnapReactionType> = ['ALL', ...REACTION_TYPES];

  // Portaled to document.body so no ancestor transform/overflow/stacking
  // context (Snap card, viewer, bottom nav) can paint above this sheet.
  return createPortal(
    <AnimatePresence>
      {open ? (
        <div
          className="fixed inset-0 z-[9999]"
          role="dialog"
          aria-modal="true"
          aria-label="Reactions"
        >
          <motion.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60"
            aria-label="Close reactions"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 420, damping: 36 }}
            className="absolute inset-x-0 bottom-0 flex max-h-[85dvh] flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-xl sm:inset-x-auto sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
          >
            <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted sm:hidden" />
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-foreground">
                Reactions
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="cursor-pointer rounded-full p-1.5 hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
                aria-label="Close reactions"
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

            {/* Filter tabs */}
            <div
              className="flex items-center gap-1 overflow-x-auto border-b border-border px-3 py-2"
              role="tablist"
              aria-label="Filter reactions"
            >
              {tabs.map((tab) => {
                const count =
                  tab === 'ALL' ? (counts.all ?? 0) : (counts[tab] ?? 0);
                if (tab !== 'ALL' && count === 0) return null;
                const selected = activeTab === tab;
                return (
                  <button
                    key={tab}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => handleTabChange(tab)}
                    className={`inline-flex min-h-[36px] shrink-0 cursor-pointer items-center gap-1 rounded-full px-3 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring ${
                      selected
                        ? 'bg-primary/10 text-primary'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <span aria-hidden>
                      {tab === 'ALL' ? 'All' : REACTION_EMOJIS[tab]}
                    </span>
                    {count > 0 ? <span>{count}</span> : null}
                  </button>
                );
              })}
            </div>

            {/* Reactor list */}
            <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
              {loading ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Loading reactions…
                </p>
              ) : error ? (
                <p
                  className="py-8 text-center text-sm text-destructive"
                  role="alert"
                >
                  {error}
                </p>
              ) : reactors.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No reactions yet.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {reactors.map((reactor) => (
                    <li
                      key={reactor.id}
                      className="flex items-center gap-3 px-2 py-2.5"
                    >
                      <Image
                        src={reactor.user.profileImage}
                        alt={reactor.user.name}
                        width={40}
                        height={40}
                        className="h-10 w-10 shrink-0 rounded-full object-cover"
                      />
                      <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                        @{reactor.user.name}
                      </p>
                      <span
                        className="text-lg leading-none"
                        aria-label={`Reacted with ${reactor.type.toLowerCase()}`}
                      >
                        {REACTION_EMOJIS[reactor.type as SnapReactionType] ??
                          '👍'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {nextCursor && !loading ? (
                <div className="px-2 py-3">
                  <button
                    type="button"
                    disabled={loadingMore}
                    onClick={() =>
                      void loadReactors(activeTab, nextCursor ?? undefined)
                    }
                    className="min-h-[40px] w-full cursor-pointer rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
                  >
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              ) : null}
            </div>

            <div
              className="shrink-0"
              style={{
                paddingBottom: 'env(safe-area-inset-bottom, 0px)',
              }}
            />
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
