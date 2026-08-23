"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import SplashScreen from "@/components/layout/SplashScreen";

interface LandingSplashProps {
  children: React.ReactNode;
}

/**
 * Wraps the landing page with the Snappy splash screen.
 * Shows for ~2.5s on initial load, then fades out to reveal content.
 * Content renders immediately underneath for SEO.
 */
export default function LandingSplash({ children }: LandingSplashProps) {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowSplash(false);
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      {/* Landing content — always in the DOM for SEO */}
      <div
        className={
          showSplash
            ? "opacity-0 pointer-events-none"
            : "opacity-100 transition-opacity duration-500"
        }
      >
        {children}
      </div>

      {/* Splash overlay */}
      <AnimatePresence>
        {showSplash && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="fixed inset-0 z-[9999] bg-background"
          >
            <SplashScreen />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
