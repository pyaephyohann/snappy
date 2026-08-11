"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { GlowButton } from "@/components/ui/glow-button";

interface NavbarProps {
  username: string;
}

export default function Navbar({ username }: NavbarProps) {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const handleLogout = async () => {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    setLogoutError(null);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
      });

      if (response.ok) {
        router.push("/");
      } else {
        setLogoutError("Failed to logout. Please try again.");
      }
    } catch {
      setLogoutError("An error occurred. Please try again.");
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Left: Snappy Branding */}
          <Link
            href="/home"
            className="flex items-center gap-2 hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-ring rounded px-2 py-1"
          >
            <Image
              src="/logo.png"
              alt="Snappy Logo"
              width={96}
              height={96}
              className="w-24 h-24"
            />
            <span className="text-2xl sm:text-4xl lg:text-5xl font-bold text-primary caveat-font">
              Snappy
            </span>
          </Link>

          {/* Right: Username + Logout */}
          <div className="flex items-center gap-3 sm:gap-4">
            <span className="text-lg sm:text-xl lg:text-2xl text-muted-foreground caveat-font">
              {username}
            </span>
            <GlowButton
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="px-3 py-1.5 sm:px-4 sm:py-2 caveat-font text-xl sm:text-2xl bg-primary text-primary-foreground rounded-lg hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:opacity-50 disabled:cursor-not-allowed transition-all min-h-[36px] sm:min-h-[40px]"
            >
              {isLoggingOut ? "Logging out..." : "Logout"}
            </GlowButton>
          </div>
        </div>

        {/* Logout Error */}
        {logoutError && (
          <div className="mt-2 sm:mt-3 p-2 sm:p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-destructive text-xs sm:text-sm text-center">
              {logoutError}
            </p>
          </div>
        )}
      </div>
    </header>
  );
}
