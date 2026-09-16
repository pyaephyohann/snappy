"use client";

import Link from "next/link";
import SnappyLogo from "@/components/ui/SnappyLogo";
import ThemeSwitcher from "@/components/theme/ThemeSwitcher";

interface NavbarProps {
  username: string;
}

export default function Navbar({ username }: NavbarProps) {
  return (
    <header className="safe-area-pt border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Left: Snappy Branding */}
          <Link
            href="/home"
            className="flex items-center gap-2 hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded px-2 py-1"
          >
            <SnappyLogo />
          </Link>

          {/* Right: Username + Theme */}
          <div className="flex items-center gap-3 sm:gap-4">
            <span className="text-lg sm:text-xl lg:text-2xl text-muted-foreground caveat-font">
              {username}
            </span>
            <ThemeSwitcher />
          </div>
        </div>
      </div>
    </header>
  );
}
