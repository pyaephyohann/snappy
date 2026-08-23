"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";
import GlowingBorder from "@/components/ui/glowing-border";

const EASE = [0.22, 1, 0.36, 1] as const;

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden pt-28 sm:pt-24">
      {/* Background decoration — subtle, not distracting */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-primary/8 rounded-full blur-3xl" />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* ── Left: Text content ── */}
          <div className="text-center lg:text-left">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, ease: EASE }}
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 text-primary text-sm font-medium mb-6 sm:mb-8">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
                </span>
                Private &amp; invite-only
              </div>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.1, ease: EASE }}
              className="text-4xl sm:text-5xl lg:text-6xl xl:text-7xl font-bold tracking-tight leading-[1.1]"
            >
              Capture the moment.
              <br />
              <span className="text-primary">Share it with</span>{" "}
              <span className="caveat-font text-primary">your people.</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2, ease: EASE }}
              className="mt-5 sm:mt-6 text-lg sm:text-xl text-muted-foreground max-w-lg mx-auto lg:mx-0 leading-relaxed"
            >
              Snappy makes it easy to share everyday moments with the people who
              matter. Send snaps, explore your friends&apos; moments, and stay
              connected — without the noise.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.3, ease: EASE }}
              className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-center gap-4 justify-center lg:justify-start"
            >
              <Link
                href="/login"
                className="group relative w-full sm:w-auto px-8 py-4 text-base font-semibold text-white bg-primary rounded-2xl hover:bg-primary/90 transition-all duration-200 hover:shadow-xl hover:shadow-primary/25 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background active:scale-[0.98] text-center"
              >
                <span className="relative z-10">Get Started</span>
                <div className="absolute inset-0 rounded-2xl bg-gradient-to-r from-primary to-purple-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
              </Link>
              <a
                href="#how-it-works"
                className="w-full sm:w-auto px-8 py-4 text-base font-medium text-muted-foreground hover:text-foreground border border-border hover:border-muted-foreground/30 rounded-2xl transition-all duration-200 hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-ring text-center"
              >
                See How It Works
              </a>
            </motion.div>
          </div>

          {/* ── Right: Product Preview — glowing Snap card ── */}
          <motion.div
            initial={{ opacity: 0, x: 40, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.3, ease: EASE }}
            className="relative flex justify-center lg:justify-end"
          >
            <div className="relative w-full max-w-sm lg:max-w-md">
              {/* Background glow — layered behind the card */}
              <div
                className="absolute inset-0 -m-12 bg-primary/8 rounded-3xl blur-3xl"
                aria-hidden="true"
              />

              {/* Floating container */}
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                className="relative"
              >
                {/* The actual Snap card — same structure as user SnapCard */}
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  transition={{ duration: 0.3, ease: EASE }}
                  className="relative"
                >
                  <GlowingBorder radius="xl" intensity="strong" className="h-full">
                    <div className="bg-card border border-border rounded-xl overflow-hidden shadow-2xl shadow-black/30">
                      {/* Snap image — same aspect as the real SnapCard */}
                      <div className="relative aspect-square">
                        <Image
                          src="/images/home/banner-1.jpeg"
                          alt="A Snappy snap — share moments with friends"
                          fill
                          className="object-cover"
                          sizes="(max-width: 640px) 80vw, (max-width: 1024px) 40vw, 380px"
                          priority
                        />

                        {/* Download button overlay — matches real SnapCard */}
                        <div className="absolute bottom-3 right-3 z-10">
                          <div className="p-2.5 rounded-full bg-background/80 backdrop-blur-sm border border-border/60 text-primary shadow-sm">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
                            </svg>
                          </div>
                        </div>
                      </div>

                      {/* Caption area — matches real SnapCard */}
                      <div className="p-4">
                        <div className="flex items-center gap-2.5 mb-2">
                          <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center">
                            <Image
                              src="/logo.png"
                              alt=""
                              width={20}
                              height={20}
                              className="w-5 h-5"
                            />
                          </div>
                          <span className="text-sm font-medium text-foreground">
                            Snappy
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Beautiful day today! ☀️
                        </p>
                        <div className="flex items-center gap-2 mt-2.5">
                          <span className="text-sm">❤️</span>
                          <span className="text-sm">🔥</span>
                          <span className="text-sm">😮</span>
                          <span className="text-xs text-muted-foreground ml-0.5">
                            12
                          </span>
                        </div>
                      </div>
                    </div>
                  </GlowingBorder>
                </motion.div>

                {/* Floating notification badges */}
                <motion.div
                  animate={{ y: [0, -10, 0], rotate: [0, 3, 0] }}
                  transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                  className="absolute -top-3 -left-4 sm:-left-10 bg-card border border-border/60 rounded-2xl px-3 py-2 shadow-xl z-20"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">📸</span>
                    <span className="text-xs font-medium text-foreground">New snap!</span>
                  </div>
                </motion.div>

                <motion.div
                  animate={{ y: [0, -8, 0], rotate: [0, -3, 0] }}
                  transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: 2 }}
                  className="absolute -bottom-2 -right-3 sm:-right-8 bg-card border border-border/60 rounded-2xl px-3 py-2 shadow-xl z-20"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-base">❤️</span>
                    <span className="text-xs font-medium text-foreground">3 reactions</span>
                  </div>
                </motion.div>
              </motion.div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
