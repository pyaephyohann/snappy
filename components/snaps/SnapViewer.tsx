'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import SnapShareMenu from '@/components/friends/SnapShareMenu';
import GlowingBorder from '@/components/ui/glowing-border';
import { GlowButton } from '@/components/ui/glow-button';
import { buildSnapFilename, downloadImage } from '@/lib/download-image';
import { shouldShowAd, incrementDownloadCount, resetDownloadCount } from '@/lib/download-ad';
import AdModal from '@/components/ui/AdModal';

interface SnapViewerProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  caption?: string | null;
  friendName: string;
  snapIndex?: number;
  snapId?: string;
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
}: SnapViewerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [showAdModal, setShowAdModal] = useState(false);
  const pendingDownloadRef = useRef<{ imageUrl: string; filename: string } | null>(null);

  

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
    return caption || `Check out ${friendName}'s Snap on Snappy!`;
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
              <div className="mb-3 flex items-center justify-center sm:mb-4 sm:justify-between">
                <h2
                  id="snap-viewer-title"
                  className="max-sm:text-center truncate text-base font-semibold text-foreground sm:pr-4 sm:text-lg lg:text-xl"
                >
                  {friendName}&apos;s Snap
                </h2>
                <div className="hidden shrink-0 items-center gap-2 sm:flex">
                  {downloadError && (
                    <p className="text-xs text-destructive" role="alert">
                      {downloadError}
                    </p>
                  )}
                  <motion.div whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}>
                    <GlowButton
                      onClick={handleDownload}
                      disabled={isDownloading}
                      radius="full"
                      glowClassName="inline-block"
                      className="p-2 sm:p-2.5 rounded-full bg-card border border-border text-foreground hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
                      aria-label="Download snap"
                    >
                      {isDownloading ? (
                        <svg
                          className="w-5 h-5 animate-spin"
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
                          className="w-5 h-5"
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
                  <button
                    onClick={onClose}
                    className="p-2 sm:p-2 rounded-full hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
                    aria-label="Close snap viewer"
                  >
                    <svg
                      className="w-5 h-5 sm:w-6 sm:h-6 text-foreground"
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
              </div>

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

              <div className="mt-3 flex flex-col items-center gap-2 sm:hidden">
                {downloadError && (
                  <p className="text-center text-xs text-destructive" role="alert">
                    {downloadError}
                  </p>
                )}
                <div className="flex items-center justify-center gap-3">
                  <motion.div whileTap={{ scale: 0.94 }}>
                    <GlowButton
                      onClick={handleDownload}
                      disabled={isDownloading}
                      radius="full"
                      glowClassName="inline-block"
                      className="rounded-full border border-border bg-card p-2.5 text-foreground transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label="Download snap"
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
                            strokeWidth="4"
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
                  <button
                    ref={closeButtonRef}
                    onClick={onClose}
                    className="rounded-full p-2.5 transition-colors hover:bg-muted focus:outline-none focus:ring-2 focus:ring-ring"
                    aria-label="Close snap viewer"
                  >
                    <svg
                      className="h-5 w-5 text-foreground"
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
              </div>

              {caption && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="mt-3 sm:mt-4 p-3 sm:p-4 bg-card border border-border rounded-xl"
                >
                  <p className="text-foreground text-xs sm:text-sm">{caption}</p>
                </motion.div>
              )}

              {/* Share */}
              <div className="mt-3 sm:mt-4 flex items-center justify-end border-t border-border pt-3">
                <SnapShareMenu
                  url={getSnapUrl()}
                  title={getShareTitle()}
                />
              </div>

            </div>
          </motion.div>
        </>
      )}
          </AnimatePresence>

      <AdModal open={showAdModal} onContinue={handleAdContinue} />
    </>
  );
}
