"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Image from "next/image";
import NavbarDesktopFriendSearch from "@/components/layout/NavbarDesktopFriendSearch";
import SparkBalancePill from "@/components/sparks/SparkBalancePill";
import SnappyLogo from "@/components/ui/SnappyLogo";
import ThemeSwitcher from "@/components/theme/ThemeSwitcher";
import GlowingBorder from "@/components/ui/glowing-border";

interface NavbarProps {
  username: string;
  profileImage?: string;
}

type DesktopNavItem = {
  href: string;
  label: string;
  match: (path: string) => boolean;
};

const DESKTOP_NAV: DesktopNavItem[] = [
  {
    href: "/home",
    label: "Home",
    match: (path) => path === "/home" || path.startsWith("/home/"),
  },
  {
    href: "/chats",
    label: "Chats",
    match: (path) => path === "/chats" || path.startsWith("/chats/"),
  },
  {
    href: "/notifications",
    label: "Alerts",
    match: (path) =>
      path === "/notifications" || path.startsWith("/notifications/"),
  },
  {
    href: "/profile",
    label: "Profile",
    match: (path) => path === "/profile" || path.startsWith("/profile/"),
  },
];

export default function Navbar({ username, profileImage }: NavbarProps) {
  const pathname = usePathname();

  return (
    <header className="safe-area-pt sticky top-0 z-10 border-b border-border bg-card/50 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-3 lg:gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-4 lg:gap-6">
            <Link
              href="/home"
              className="flex shrink-0 items-center gap-2 rounded px-2 py-1 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <SnappyLogo />
            </Link>

            <nav
              className="hidden shrink-0 items-center gap-1 lg:flex"
              aria-label="Main navigation"
            >
              {DESKTOP_NAV.map((item) => {
                const active = item.match(pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                    aria-current={active ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <NavbarDesktopFriendSearch />
          </div>

          <div className="flex shrink-0 items-center gap-3 sm:gap-4">
            <SparkBalancePill />
            <Link
              href="/friends"
              className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Open Friends"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.75}
                  d="M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM3 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 019.374 21c-2.331 0-4.512-.645-6.374-1.766z"
                />
              </svg>
              <span className="hidden xl:inline">Friends</span>
            </Link>
            <Link
              href="/chats"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Open chats"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M8 10h8M8 14h5m7-2a8 8 0 11-16 0c0 1.35.335 2.622.926 3.736L4 20l4.264-1.926A8 8 0 0020 12z" />
              </svg>
            </Link>
            <Link
              href="/profile"
              className="flex items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Go to profile"
            >
              <GlowingBorder radius="full" featured className="inline-block">
                <div className="relative h-9 w-9 overflow-hidden rounded-full ring-2 ring-border sm:h-10 sm:w-10">
                  <Image
                    src={profileImage ?? "/anya.jpeg"}
                    alt={`${username}'s profile`}
                    fill
                    className="object-cover"
                    sizes="40px"
                  />
                </div>
              </GlowingBorder>
            </Link>
            <ThemeSwitcher />
          </div>
        </div>
      </div>
    </header>
  );
}
