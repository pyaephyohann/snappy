'use client';

import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import SnapShareMenu from '@/components/friends/SnapShareMenu';
import SnapSocialBar from '@/components/snaps/SnapSocialBar';
import GlowingBorder from '@/components/ui/glowing-border';
import { GlowButton } from '@/components/ui/glow-button';
import { buildSnapFilename } from '@/lib/download-image';
import { useSnapDownload } from '@/hooks/useSnapDownload';
import DownloadSparkConfirmModal from '@/components/snaps/DownloadSparkConfirmModal';

interface SnapCardProps {
  id: string;
  imageUrl: string;
  caption?: string | null;
  createdAt: Date | string;
  friendName: string;
  snapIndex: number;
  /** Uploader display name when attribution exists (legacy snaps may omit). */
  uploaderName?: string | null;
  interactive?: boolean;
  onClick?: () => void;
}

export default function SnapCard({
  id,
  imageUrl,
  caption,
  createdAt,
  friendName,
  snapIndex,
  uploaderName,
  interactive = false,
  onClick,
}: SnapCardProps) {
  const [shareOpen, setShareOpen] = useState(false);

  // Server-authoritative download flow (D3): the server decides whether the
  // download is free or costs a Spark; the card only runs the shared client
  // flow and renders the confirmation when the server asks for one.
  const downloadFilename = buildSnapFilename(friendName, snapIndex, imageUrl);
  const {
    isDownloading,
    downloadError,
    pendingSpark,
    isConfirmingSpark,
    sparkConfirmError,
    startDownload,
    confirmSparkDownload,
    cancelSparkDownload,
  } = useSnapDownload({
    imageUrl,
    filename: downloadFilename,
    failureMessage: 'Download failed',
  });

  const formatDate = (date: Date | string) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getSnapUrl = () => {
    if (typeof window !== 'undefined') {
      return `${window.location.origin}/friends/${encodeURIComponent(friendName)}`;
    }
    return '';
  };

  const getShareTitle = () => {
    return caption || `Check out ${friendName}'s Snap on Snappy!`;
  };

  const handleDownload = useCallback(
    (event: React.MouseEvent) => {
      event.stopPropagation();
      void startDownload();
    },
    [startDownload],
  );

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      onClick={onClick}
      className={`h-full ${interactive ? 'cursor-pointer' : ''}`}
    >
      <GlowingBorder radius="xl" className="h-full">
        <div
          className={`flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-lg transition-all duration-300 ${
            interactive ? 'hover:shadow-xl' : ''
          }`}
        >
          <div className="relative aspect-square w-full shrink-0">
            <Image
              src={imageUrl}
              alt={caption || 'Snap'}
              fill
              className="object-cover"
              sizes="(max-width: 640px) 90vw, (max-width: 1200px) 45vw, 30vw"
              unoptimized={imageUrl.includes('.svg') || imageUrl.includes('dicebear')}
            />

            <div
              className="absolute bottom-2 right-2 sm:bottom-3 sm:right-3 z-10 flex flex-col items-end gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              {downloadError && (
                <p
                  className="max-w-[80%] rounded bg-background/90 px-1.5 py-0.5 text-right text-[10px] text-destructive backdrop-blur-sm sm:text-xs"
                  role="alert"
                >
                  {downloadError}
                </p>
              )}
              <motion.div whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.92 }}>
                <GlowButton
                  onClick={handleDownload}
                  disabled={isDownloading}
                  radius="full"
                  glowClassName="inline-block"
                  className="flex items-center justify-center p-2 sm:p-2.5 rounded-full bg-background/80 backdrop-blur-sm border border-border/60 text-primary hover:bg-background/95 hover:text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                  aria-label={`Download snap ${snapIndex + 1}`}
                >
                  {isDownloading ? (
                    <svg
                      className="w-4 h-4 sm:w-5 sm:h-5 animate-spin"
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
                      className="w-4 h-4 sm:w-5 sm:h-5"
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
            </div>
          </div>

          {/* Caption + metadata — grows with the text instead of scrolling. */}
          <div className="flex flex-1 flex-col gap-2 p-3 sm:gap-3 sm:p-4">
            {caption ? (
              <p className="text-sm leading-relaxed text-foreground [overflow-wrap:anywhere]">
                {caption}
              </p>
            ) : null}

            <div className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground sm:text-xs">
              {uploaderName ? (
                <span className="[overflow-wrap:anywhere]">Uploaded by {uploaderName}</span>
              ) : null}
              {uploaderName && createdAt ? (
                <span aria-hidden="true">•</span>
              ) : null}
              {createdAt ? <span>{formatDate(createdAt)}</span> : null}
            </div>
          </div>

          {/* Social actions (Like / Comment / Share) */}
          <div
            className="px-3 pb-3 sm:px-4 sm:pb-4"
            onClick={(e) => e.stopPropagation()}
          >
            <SnapSocialBar
              snapId={id}
              onShare={() => setShareOpen(true)}
            />
            <SnapShareMenu
              url={getSnapUrl()}
              title={getShareTitle()}
              open={shareOpen}
              onOpenChange={setShareOpen}
            />
          </div>
        </div>
      </GlowingBorder>

      <DownloadSparkConfirmModal
        pending={pendingSpark}
        confirming={isConfirmingSpark}
        error={sparkConfirmError}
        onConfirm={() => void confirmSparkDownload()}
        onCancel={cancelSparkDownload}
      />
    </motion.div>
  );
}

