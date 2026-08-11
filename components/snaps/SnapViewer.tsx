'use client';

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import GlowingBorder from '@/components/ui/glowing-border';

interface SnapViewerProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  caption?: string | null;
  friendName: string;
}

export default function SnapViewer({
  isOpen,
  onClose,
  imageUrl,
  caption,
  friendName,
}: SnapViewerProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Focus close button when modal opens
      closeButtonRef.current?.focus();
      // Prevent body scroll
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
            onClick={onClose}
            aria-hidden="true"
          />

          {/* Modal */}
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
              {/* Header */}
              <div className="flex items-center justify-between mb-3 sm:mb-4">
                <h2 id="snap-viewer-title" className="text-base sm:text-lg lg:text-xl font-semibold text-foreground truncate pr-4">
                  {friendName}&apos;s Snap
                </h2>
                <button
                  ref={closeButtonRef}
                  onClick={onClose}
                  className="p-2 sm:p-2 rounded-full hover:bg-muted transition-colors focus:outline-none focus:ring-2 focus:ring-ring flex-shrink-0"
                  aria-label="Close snap viewer"
                >
                  <svg className="w-5 h-5 sm:w-6 sm:h-6 text-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Image Container */}
              <GlowingBorder radius="xl" intensity="strong" className="flex-1 min-h-[40vh] sm:min-h-[50vh]">
                <div className="relative h-full min-h-[40vh] sm:min-h-[50vh] bg-card rounded-xl overflow-hidden border border-border">
                  <Image
                    src={imageUrl}
                    alt={caption || 'Snap'}
                    fill
                    className="object-contain"
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 90vw, 80vw"
                    priority
                    unoptimized={imageUrl.includes('.svg') || imageUrl.includes('dicebear')}
                  />
                </div>
              </GlowingBorder>

              {/* Caption */}
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
