'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import SnapShareMenu from '@/components/friends/SnapShareMenu';
import SnapSocialBar from '@/components/snaps/SnapSocialBar';
import GlowingBorder from '@/components/ui/glowing-border';
import { GlowButton } from '@/components/ui/glow-button';
import { buildSnapFilename, downloadImage } from '@/lib/download-image';
import { shouldShowAd, incrementDownloadCount, resetDownloadCount } from '@/lib/download-ad';
import { SNAP_MAX_CAPTION_LENGTH } from '@/lib/snap-media';
import AdModal from '@/components/ui/AdModal';

interface SnapViewerProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  caption?: string | null;
  friendName: string;
  snapIndex?: number;
  snapId?: string;
  /**
   * Show inline caption editing. Only pass true for snaps the viewer uploaded;
   * the caption API independently verifies uploader ownership server-side.
   */
  canEditCaption?: boolean;
  /** Called with the saved caption after a successful update. */
  onCaptionSaved?: (caption: string | null) => void;
}

// Temporarily disabled for production: Comments interface
/*
interface Comment {
  id: string;
  content: string;
  createdAt: Date | string;
  user: {
    id: string;
    name: string;
    profileImage: string;
  };
  likeCount: number;
  liked: boolean;
}
*/

// Temporarily disabled for production: Reaction types & constants
/*
const REACTION_TYPES = ['LIKE', 'LOVE', 'HAHA', 'WOW', 'SAD', 'ANGRY'] as const;

const REACTION_EMOJIS: Record<string, string> = {
  LIKE: '👍',
  LOVE: '❤️',
  HAHA: '😂',
  WOW: '😮',
  SAD: '😢',
  ANGRY: '😡',
};

const MAX_COMMENT_LENGTH = 500;
*/

export default function SnapViewer({
  isOpen,
  onClose,
  imageUrl,
  caption,
  friendName,
  snapIndex = 0,
  snapId,
  canEditCaption = false,
  onCaptionSaved,
}: SnapViewerProps) {
  const closeButtonRef = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [showAdModal, setShowAdModal] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const pendingDownloadRef = useRef<{ imageUrl: string; filename: string } | null>(null);

  // Caption editing (profile "My Snaps" only). The viewer is keyed by snap id,
  // so this state starts fresh for each opened Snap.
  const [captionValue, setCaptionValue] = useState<string | null>(caption ?? null);
  const [editingCaption, setEditingCaption] = useState(false);
  const [captionDraft, setCaptionDraft] = useState(caption ?? '');
  const [savingCaption, setSavingCaption] = useState(false);
  const [captionError, setCaptionError] = useState<string | null>(null);
  const canEdit = canEditCaption && Boolean(snapId);

  const handleStartCaptionEdit = () => {
    setCaptionDraft(captionValue ?? '');
    setCaptionError(null);
    setEditingCaption(true);
  };

  const handleCancelCaptionEdit = () => {
    setEditingCaption(false);
    setCaptionError(null);
  };

  const handleSaveCaption = async () => {
    if (!snapId || savingCaption) return;

    setSavingCaption(true);
    setCaptionError(null);

    try {
      const response = await fetch(`/api/snaps/${snapId}/caption`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caption: captionDraft }),
      });

      const result = (await response.json()) as {
        error?: string;
        snap?: { caption: string | null };
      };

      if (!response.ok) {
        throw new Error(result.error ?? 'Failed to update caption');
      }

      const nextCaption = result.snap?.caption ?? null;
      setCaptionValue(nextCaption);
      setEditingCaption(false);
      onCaptionSaved?.(nextCaption);
    } catch (error) {
      setCaptionError(
        error instanceof Error ? error.message : 'Failed to update caption',
      );
    } finally {
      setSavingCaption(false);
    }
  };

  

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      closeButtonRef.current?.focus();
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  const performDownload = useCallback(
    async (url: string, fname: string) => {
      setIsDownloading(true);
      setDownloadError(null);

      try {
        await downloadImage(url, fname);
        incrementDownloadCount();
      } catch {
        setDownloadError('Download failed. Please try again.');
      } finally {
        setIsDownloading(false);
      }
    },
    [],
  );

  const handleAdContinue = useCallback(() => {
    setShowAdModal(false);
    resetDownloadCount();
    const pending = pendingDownloadRef.current;
    if (pending) {
      pendingDownloadRef.current = null;
      void performDownload(pending.imageUrl, pending.filename);
    }
  }, [performDownload]);

  const handleDownload = useCallback(async () => {
    if (isDownloading) return;

    const filename = buildSnapFilename(friendName, snapIndex, imageUrl);

    if (shouldShowAd()) {
      pendingDownloadRef.current = { imageUrl, filename };
      setShowAdModal(true);
      return;
    }

    void performDownload(imageUrl, filename);
  }, [friendName, snapIndex, imageUrl, isDownloading, performDownload]);

  const getSnapUrl = () => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/friends/${encodeURIComponent(friendName)}`;
    }
    return '';
  };

  const getShareTitle = () => {
    return captionValue || `Check out ${friendName}'s Snap on Snappy!`;
  };



  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
            onClick={onClose}
            aria-hidden="true"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 lg:p-8"
            role="dialog"
            aria-modal="true"
            aria-labelledby="snap-viewer-title"
          >
            <div className="relative max-w-6xl w-full max-h-[90vh] flex flex-col">
              <div className="flex items-center justify-between mb-3 sm:mb-4 gap-2">
                <h2
                  id="snap-viewer-title"
                  className="text-base sm:text-lg lg:text-xl font-semibold text-foreground truncate pr-4"
                >
                  {friendName}&apos;s Snap
                </h2>
                <div className="flex items-center gap-2.5 shrink-0">
                  {downloadError && (
                    <p className="text-xs text-destructive hidden sm:block" role="alert">
                      {downloadError}
                    </p>
                  )}
                  <motion.div whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}>
                    <GlowButton
                      onClick={handleDownload}
                      disabled={isDownloading}
                      radius="full"
                      glowClassName="inline-block"
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card/90 text-foreground backdrop-blur-sm transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label="Download snap"
                      title="Download snap"
                    >
                      {isDownloading ? (
                        <svg
                          className="h-5 w-5 animate-spin"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth={4}
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                      ) : (
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4"
                          />
                        </svg>
                      )}
                    </GlowButton>
                  </motion.div>
                  <motion.div whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }} ref={closeButtonRef} tabIndex={-1} className="focus:outline-none">
                    <GlowButton
                      onClick={onClose}
                      radius="full"
                      glowClassName="inline-block"
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card/90 text-foreground backdrop-blur-sm transition-colors hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label="Close snap viewer"
                      title="Close"
                    >
                      <svg
                        className="h-5 w-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </GlowButton>
                  </motion.div>
                </div>
              </div>

              {downloadError && (
                <p className="text-xs text-destructive mb-2 sm:hidden" role="alert">
                  {downloadError}
                </p>
              )}

              <GlowingBorder
                radius="xl"
                intensity="strong"
                className="flex-1 min-h-[40vh] sm:min-h-[50vh]"
              >
                <div className="relative h-full min-h-[40vh] sm:min-h-[50vh] bg-card rounded-xl overflow-hidden border border-border">
                  <Image
                    src={imageUrl}
                    alt={caption || 'Snap'}
                    fill
                    className="object-contain"
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 90vw, 80vw"
                    priority
                    unoptimized={
                      imageUrl.includes('.svg') || imageUrl.includes('dicebear')
                    }
                  />
                </div>
              </GlowingBorder>

              {(captionValue || canEdit) && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="mt-3 sm:mt-4 p-3 sm:p-4 bg-card border border-border rounded-xl"
                >
                  {editingCaption ? (
                    <div className="space-y-3">
                      <label
                        htmlFor="snap-viewer-caption"
                        className="block text-xs font-medium text-muted-foreground"
                      >
                        Caption
                      </label>
                      <textarea
                        id="snap-viewer-caption"
                        value={captionDraft}
                        onChange={(event) => {
                          if (event.target.value.length <= SNAP_MAX_CAPTION_LENGTH) {
                            setCaptionDraft(event.target.value);
                          }
                        }}
                        rows={3}
                        maxLength={SNAP_MAX_CAPTION_LENGTH}
                        placeholder="Write a caption..."
                        disabled={savingCaption}
                        className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-base text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                      />
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-xs text-muted-foreground">
                          {captionDraft.length}/{SNAP_MAX_CAPTION_LENGTH}
                        </span>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handleCancelCaptionEdit}
                            disabled={savingCaption}
                            className="min-h-[40px] rounded-lg border border-border px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleSaveCaption()}
                            disabled={savingCaption}
                            className="min-h-[40px] rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {savingCaption ? "Saving…" : "Save"}
                          </button>
                        </div>
                      </div>
                      {captionError ? (
                        <p className="text-xs text-destructive" role="alert">
                          {captionError}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-foreground text-xs sm:text-sm">
                        {captionValue ?? (
                          <span className="text-muted-foreground">
                            No caption yet.
                          </span>
                        )}
                      </p>
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={handleStartCaptionEdit}
                          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
                          aria-label="Edit caption"
                        >
                          <svg
                            className="h-3.5 w-3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            viewBox="0 0 24 24"
                            aria-hidden="true"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897l12.682-12.68z"
                            />
                          </svg>
                          Edit caption
                        </button>
                      ) : null}
                    </div>
                  )}
                </motion.div>
              )}

              {/* Social actions (Like / Comment / Share) */}
              {snapId ? (
                <div className="mt-3 sm:mt-4 rounded-xl border border-border bg-card p-2 sm:p-3">
                  <SnapSocialBar
                    snapId={snapId}
                    onShare={() => setShareOpen(true)}
                  />
                  <SnapShareMenu
                    url={getSnapUrl()}
                    title={getShareTitle()}
                    open={shareOpen}
                    onOpenChange={setShareOpen}
                  />
                </div>
              ) : (
                <div className="mt-3 sm:mt-4 flex items-center justify-end border-t border-border pt-3">
                  <SnapShareMenu
                    url={getSnapUrl()}
                    title={getShareTitle()}
                  />
                </div>
              )}

            </div>
          </motion.div>
        </>
      )}
          </AnimatePresence>

      <AdModal open={showAdModal} onContinue={handleAdContinue} />
    </>
  );
}
