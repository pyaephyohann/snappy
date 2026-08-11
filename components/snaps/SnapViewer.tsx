'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import GlowingBorder from '@/components/ui/glowing-border';
import { GlowButton } from '@/components/ui/glow-button';
import { buildSnapFilename, downloadImage } from '@/lib/download-image';

interface SnapViewerProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  caption?: string | null;
  friendName: string;
  snapIndex?: number;
}

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

  const handleDownload = useCallback(async () => {
    if (isDownloading) return;

    setIsDownloading(true);
    setDownloadError(null);

    try {
      const filename = buildSnapFilename(friendName, snapIndex, imageUrl);
      await downloadImage(imageUrl, filename);
    } catch {
      setDownloadError('Download failed. Please try again.');
    } finally {
      setIsDownloading(false);
    }
  }, [friendName, snapIndex, imageUrl, isDownloading]);

  return (
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
                <div className="flex items-center gap-2 shrink-0">
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
                    ref={closeButtonRef}
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
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
