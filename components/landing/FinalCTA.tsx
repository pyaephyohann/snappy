"use client";

import { motion } from "framer-motion";
import Link from "next/link";

export default function FinalCTA() {
  return (
    <section className="relative py-20 sm:py-28 overflow-hidden">
      {/* Background glow */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-primary/8 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="relative bg-card border border-border/60 rounded-3xl p-8 sm:p-12 lg:p-16 text-center shadow-2xl shadow-black/20 overflow-hidden"
        >
          {/* Decorative floating elements */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
            <motion.div
              animate={{ y: [0, -15, 0], rotate: [0, 10, 0] }}
              transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
              className="absolute top-8 left-8 sm:left-16 w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center text-2xl"
            >
              📸
            </motion.div>
            <motion.div
              animate={{ y: [0, -10, 0], rotate: [0, -8, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
              className="absolute top-12 right-8 sm:right-20 w-12 h-12 bg-primary/10 rounded-2xl flex items-center justify-center text-2xl"
            >
              ❤️
            </motion.div>
            <motion.div
              animate={{ y: [0, -12, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut", delay: 2 }}
              className="absolute bottom-10 left-12 sm:left-24 w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-xl hidden sm:flex"
            >
              💬
            </motion.div>
            <motion.div
              animate={{ y: [0, -8, 0], rotate: [0, 5, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
              className="absolute bottom-16 right-10 sm:right-28 w-11 h-11 bg-primary/10 rounded-xl flex items-center justify-center text-xl hidden sm:flex"
            >
              👍
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
          >
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight mb-4 sm:mb-5">
              Ready to make your{" "}
              <span className="caveat-font text-primary">moments</span>{" "}
              snappy?
            </h2>
            <p className="text-lg sm:text-xl text-muted-foreground max-w-xl mx-auto mb-8 sm:mb-10">
              Join Snappy and start sharing the little moments that matter.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center px-8 py-4 text-base font-semibold text-white bg-primary rounded-2xl hover:bg-primary/90 transition-all duration-200 hover:shadow-xl hover:shadow-primary/25 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background active:scale-[0.98]"
            >
              Get Started
              <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
