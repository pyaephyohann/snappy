'use client';

import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import Image from 'next/image';
import GlowingBorder from '@/components/ui/glowing-border';
import { GlowButton } from '@/components/ui/glow-button';
import { buildSnapFilename, downloadImage } from '@/lib/download-image';

interface SnapCardProps {
  imageUrl: string;
  caption?: string | null;
  createdAt: Date | string;
  friendName: string;
  snapIndex: number;
  interactive?: boolean;
  onClick?: () => void;
}

export default function SnapCard({
  imageUrl,
  caption,
  createdAt,
  friendName,
  snapIndex,
  interactive = false,
  onClick,
}: SnapCardProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const formatDate = (date: Date | string) => {
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    return dateObj.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleDownload = useCallback(
    async (event: React.MouseEvent) => {
      event.stopPropagation();

      if (isDownloading) return;

      setIsDownloading(true);
      setDownloadError(null);

      try {
        const filename = buildSnapFilename(friendName, snapIndex, imageUrl);
        await downloadImage(imageUrl, filename);
      } catch {
        setDownloadError('Download failed');
      } finally {
        setIsDownloading(false);
      }
    },
    [friendName, snapIndex, imageUrl, isDownloading],
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
          className={`bg-card border border-border rounded-xl overflow-hidden shadow-lg transition-all duration-300 h-full ${
            interactive ? 'hover:shadow-xl' : ''
          }`}
        >
          <div className="relative aspect-square">
            <Image
              src={imageUrl}
              alt={caption || 'Snap'}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 50vw, (max-width: 1200px) 50vw, 33vw"
              unoptimized={imageUrl.includes('.svg') || imageUrl.includes('dicebear')}
            />

            <div
              className="absolute bottom-2 right-2 sm:bottom-3 sm:right-3 z-10 flex flex-col items-end gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              {downloadError && (
                <p
                  className="text-[10px] sm:text-xs text-destructive bg-background/90 backdrop-blur-sm px-1.5 py-0.5 rounded max-w-[120px] text-right"
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
                  className="p-2 sm:p-2.5 rounded-full bg-background/80 backdrop-blur-sm border border-border/60 text-primary hover:bg-background/95 hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
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

          {(caption || createdAt) && (
            <div className="p-2 sm:p-4">
              {caption && (
                <p className="text-foreground text-xs sm:text-sm mb-1 sm:mb-2 line-clamp-2">{caption}</p>
              )}
              {createdAt && (
                <p className="text-muted-foreground text-xs">{formatDate(createdAt)}</p>
              )}
            </div>
          )}
        </div>
      </GlowingBorder>
    </motion.div>
  );
}
