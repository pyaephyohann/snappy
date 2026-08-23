"use client";

import { motion, AnimatePresence } from "framer-motion";

interface AdModalProps {
  open: boolean;
  onContinue: () => void;
}

/**
 * Lightweight ad modal shown between download cycles.
 * Matches Snappy's dark theme and design language.
 */
export default function AdModal({ open, onContinue }: AdModalProps) {
  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
            onClick={onContinue}
            aria-hidden="true"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-label="Advertisement"
          >
            <div className="w-full max-w-sm bg-card border border-border rounded-2xl shadow-2xl shadow-black/40 overflow-hidden">
              {/* Ad placeholder area */}
              <div className="relative aspect-[4/3] bg-gradient-to-br from-primary/10 via-primary/5 to-background flex items-center justify-center">
                <div className="text-center px-6">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/15 flex items-center justify-center">
                    <svg
                      className="w-8 h-8 text-primary"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-foreground mb-1">
                    Advertisement
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Support Snappy by viewing this ad
                  </p>
                </div>
              </div>

              {/* Continue button */}
              <div className="p-5">
                <button
                  type="button"
                  onClick={onContinue}
                  className="w-full py-3 px-4 bg-primary text-primary-foreground font-semibold rounded-xl hover:bg-primary/90 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-card active:scale-[0.98]"
                >
                  Continue
                </button>
                <p className="text-xs text-muted-foreground text-center mt-3">
                  You&apos;ve downloaded 2 snaps. Watch this ad to keep downloading.
                </p>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
