'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FacebookShareButton,
  FacebookIcon,
  TelegramShareButton,
  TelegramIcon,
  FacebookMessengerShareButton,
  FacebookMessengerIcon,
  ViberShareButton,
  ViberIcon,
} from 'react-share';

interface SnapShareMenuProps {
  /** URL to share — the Snap's public page */
  url: string;
  /** Title / quote for platforms that support it */
  title: string;
  /** Additional message for platforms like Messenger */
  message?: string;
}

export default function SnapShareMenu({
  url,
  title,
  message,
}: SnapShareMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  const handleToggle = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsOpen((prev) => !prev);
    },
    [],
  );

  const handleClose = useCallback(() => {
    setIsOpen(false);
  }, []);

const shareMessage = message || title;

  const buttonClass =
    'flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-secondary/50 transition-colors text-sm w-full text-left focus:outline-none focus:ring-2 focus:ring-ring';

  return (
    <div className="relative flex-shrink-0">
      {/* Share button */}
      <motion.button
        ref={buttonRef}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={handleToggle}
        className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-secondary/50 hover:bg-secondary/80 transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label="Share this Snap"
        aria-expanded={isOpen}
      >
        <svg
          className="w-4 h-4 sm:w-5 sm:h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
          />
        </svg>
      </motion.button>

      {/* Share menu popover */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Invisible backdrop to catch outside clicks */}
            <div className="fixed inset-0 z-40" aria-hidden="true" />

            <motion.div
              ref={menuRef}
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
              className="absolute bottom-full right-0 mb-2 z-50 w-56"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="bg-card border border-border rounded-xl shadow-xl shadow-black/20 p-2">
                <p className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
                  Share this Snap
                </p>

                <FacebookShareButton
                  url={url}
                  className={buttonClass}
                  aria-label="Share on Facebook"
                >
                  <FacebookIcon size={20} round />
                  <span className="text-foreground">Facebook</span>
                </FacebookShareButton>

                <TelegramShareButton
                  url={url}
                  title={shareMessage}
                  className={buttonClass}
                  aria-label="Share on Telegram"
                >
                  <TelegramIcon size={20} round />
                  <span className="text-foreground">Telegram</span>
                </TelegramShareButton>

                <FacebookMessengerShareButton
                  url={url}
                  appId=""
                  className={buttonClass}
                  aria-label="Share on Messenger"
                >
                  <FacebookMessengerIcon size={20} round />
                  <span className="text-foreground">Messenger</span>
                </FacebookMessengerShareButton>

                <ViberShareButton
                  url={url}
                  title={shareMessage}
                  className={buttonClass}
                  aria-label="Share on Viber"
                >
                  <ViberIcon size={20} round />
                  <span className="text-foreground">Viber</span>
                </ViberShareButton>

                <div className="border-t border-border mt-1 pt-1">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="w-full px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors text-center focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    Close
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
