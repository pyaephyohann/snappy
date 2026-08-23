"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import Image from "next/image";

const EASE = [0.22, 1, 0.36, 1] as const;

export default function Hero() {
  return (
    <section className="relative min-h-screen flex items-center overflow-hidden pt-20 sm:pt-24">
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

          {/* ── Right: Product Preview (real app image) ── */}
          <motion.div
            initial={{ opacity: 0, x: 40, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.3, ease: EASE }}
            className="relative flex justify-center lg:justify-end"
          >
            <div className="relative w-full max-w-md lg:max-w-lg">
              {/* Glow behind */}
              <div
                className="absolute inset-0 -m-10 bg-primary/10 rounded-3xl blur-3xl"
                aria-hidden="true"
              />

              {/* Product card frame */}
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
                className="relative"
              >
                {/* Phone-style frame */}
                <div className="relative bg-card rounded-3xl border border-border/60 shadow-2xl shadow-black/40 overflow-hidden p-3">
                  {/* Inner device bezel */}
                  <div className="relative rounded-2xl overflow-hidden bg-background">
                    {/* Notch */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-5 bg-card rounded-b-2xl z-10" />

                    {/* Banner image */}
                    <div className="relative aspect-[9/16] max-h-[480px]">
                      <Image
                        src="/images/home/banner-1.jpeg"
                        alt="Snappy — capture and share moments with friends"
                        fill
                        className="object-cover"
                        sizes="(max-width: 640px) 80vw, (max-width: 1024px) 40vw, 380px"
                        priority
                      />
                      {/* Bottom gradient overlay */}
                      <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

                      {/* App UI overlay */}
                      <div className="absolute bottom-0 left-0 right-0 p-5">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-9 h-9 rounded-full overflow-hidden bg-primary/20 flex items-center justify-center">
                            <span className="text-sm">📸</span>
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-white">Your Feed</p>
                            <p className="text-xs text-white/60">3 friends online</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg">❤️</span>
                          <span className="text-lg">🔥</span>
                          <span className="text-lg">😮</span>
                          <span className="text-xs text-white/50 ml-1">12</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bottom nav bar inside frame */}
                  <div className="flex items-center justify-around py-2.5 mt-1">
                    <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                    <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a4 4 0 11-6 0 3 4 0 016 0z" />
                    </svg>
                    <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center -mt-4 shadow-lg shadow-primary/30">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                    </svg>
                    <svg className="w-5 h-5 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                </div>

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
