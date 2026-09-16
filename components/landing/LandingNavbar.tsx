"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import SnappyLogo from "@/components/ui/SnappyLogo";
import MobileThemeSwitcher from "@/components/theme/MobileThemeSwitcher";
import ThemeSwitcher from "@/components/theme/ThemeSwitcher";

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
];

export default function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <motion.header
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className={`safe-area-pt fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-background/80 backdrop-blur-xl border-b border-border/50 shadow-lg shadow-black/10"
          : "bg-transparent"
      }`}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg px-2 py-1 -ml-2"
            aria-label="Snappy Home"
          >
            <span className="group-hover:scale-105 transition-transform duration-200 inline-flex">
              <SnappyLogo />
            </span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-1">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* Desktop CTAs */}
          <div className="hidden md:flex items-center gap-3 shrink-0">
            <Link
              href="/login"
              className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              Login
            </Link>
            <Link
              href="/login"
              className="px-5 py-2.5 text-sm font-semibold text-white bg-primary rounded-xl hover:bg-primary/90 transition-all duration-200 hover:shadow-lg hover:shadow-primary/25 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background active:scale-[0.98]"
            >
              Get Started
            </Link>
            <ThemeSwitcher />
          </div>

          <MobileThemeSwitcher />
        </div>
      </nav>
    </motion.header>
  );
}
