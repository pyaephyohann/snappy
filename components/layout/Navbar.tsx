"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import NavbarDesktopFriendSearch from "@/components/layout/NavbarDesktopFriendSearch";
import SnappyLogo from "@/components/ui/SnappyLogo";
import ThemeSwitcher from "@/components/theme/ThemeSwitcher";

interface NavbarProps {
  username: string;
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

export default function Navbar({ username }: NavbarProps) {
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
            <span className="caveat-font max-w-[8rem] truncate text-lg text-muted-foreground sm:max-w-none sm:text-xl lg:text-2xl">
              {username}
            </span>
            <ThemeSwitcher />
          </div>
        </div>
      </div>
    </header>
  );
}
