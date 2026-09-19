"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import SnappyLogo from "@/components/ui/SnappyLogo";
import {
  BackIcon,
  DashboardIcon,
  LogoutIcon,
  HeroCarouselIcon,
  SnapsIcon,
  UsersIcon,
} from "@/components/admin/icons";

interface AdminSidebarProps {
  uuid: string;
  onNavigate?: () => void;
  showUserActions?: boolean;
  username?: string;
  onLogout?: () => void;
  isLoggingOut?: boolean;
}

export default function AdminSidebar({
  uuid,
  onNavigate,
  showUserActions = false,
  username,
  onLogout,
  isLoggingOut = false,
}: AdminSidebarProps) {
  const pathname = usePathname();

  const navItems = [
    { href: `/admin/${uuid}`, label: "Dashboard", icon: DashboardIcon, exact: true },
    { href: `/admin/${uuid}/users`, label: "Users", icon: UsersIcon, exact: false },
    { href: `/admin/${uuid}/snaps`, label: "Snaps", icon: SnapsIcon, exact: false },
    {
      href: `/admin/${uuid}/hero-carousel`,
      label: "Carousel (Auto)",
      icon: HeroCarouselIcon,
      exact: false,
    },
  ];

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <aside className="flex h-full flex-col border-r border-border bg-card/60">
      <header className="border-b border-border px-5 py-5">
        <Link
          href={`/admin/${uuid}`}
          onClick={onNavigate}
          className="flex items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <SnappyLogo size="sm" admin />
        </Link>
        {showUserActions ? (
          <div className="mt-4 border-t border-border pt-4">
            <AdminNavbarUserActions
              username={username!}
              onLogout={onLogout!}
              isLoggingOut={isLoggingOut ?? false}
            />
          </div>
        ) : null}
      </header>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map(({ href, label, icon: Icon, exact }) => {
          const active = isActive(href, exact);
          return (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="space-y-1 border-t border-border px-3 py-4">
        <Link
          href="/login"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <BackIcon />
          Go to Snappy User App
        </Link>
      </div>
    </aside>
  );
}

export function AdminNavbarUserActions({
  username,
  onLogout,
  isLoggingOut,
  compact = false,
}: {
  username: string;
  onLogout: () => void;
  isLoggingOut: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 items-center ${
        compact ? "shrink-0 gap-2" : "justify-between gap-3"
      }`}
    >
      <span
        className={`truncate text-muted-foreground ${
          compact
            ? "max-w-[5.5rem] text-xs sm:max-w-[8rem] sm:text-sm"
            : "min-w-0 flex-1 text-sm"
        }`}
        title={username}
      >
        {username}
      </span>
      <button
        type="button"
        onClick={onLogout}
        disabled={isLoggingOut}
        aria-label={isLoggingOut ? "Logging out" : "Logout"}
        className={`flex shrink-0 cursor-pointer items-center rounded-xl border border-border font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 ${
          compact
            ? "gap-1.5 px-2 py-1.5 text-xs"
            : "gap-2 px-3 py-2 text-sm"
        }`}
      >
        <LogoutIcon className={compact ? "h-4 w-4" : "h-5 w-5"} />
        <span className={compact ? "max-[359px]:sr-only" : undefined}>
          {isLoggingOut ? "Logging out..." : "Logout"}
        </span>
      </button>
    </div>
  );
}
