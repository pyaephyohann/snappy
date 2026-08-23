"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import SnappyLogo from "@/components/ui/SnappyLogo";
import {
  BackIcon,
  DashboardIcon,
  LogoutIcon,
  SnapsIcon,
  UsersIcon,
} from "@/components/admin/icons";

interface AdminSidebarProps {
  uuid: string;
  onNavigate?: () => void;
}

export default function AdminSidebar({ uuid, onNavigate }: AdminSidebarProps) {
  const pathname = usePathname();

  const navItems = [
    { href: `/admin/${uuid}`, label: "Dashboard", icon: DashboardIcon, exact: true },
    { href: `/admin/${uuid}/users`, label: "Users", icon: UsersIcon, exact: false },
    { href: `/admin/${uuid}/snaps`, label: "Snaps", icon: SnapsIcon, exact: false },
  ];

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <aside className="flex h-full flex-col border-r border-border bg-card/60">
      <div className="border-b border-border px-5 py-5">
        <Link
          href={`/admin/${uuid}`}
          onClick={onNavigate}
          className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg"
        >
          <SnappyLogo size="sm" admin />
        </Link>
      </div>

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
          href="/home"
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <BackIcon />
          Back to Snappy
        </Link>
      </div>
    </aside>
  );
}

export function AdminSidebarFooter({
  username,
  onLogout,
  isLoggingOut,
}: {
  username: string;
  onLogout: () => void;
  isLoggingOut: boolean;
}) {
  return (
    <div className="border-t border-border px-5 py-4">
      <div className="mb-3 text-sm text-muted-foreground">{username}</div>
      <button
        type="button"
        onClick={onLogout}
        disabled={isLoggingOut}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        <LogoutIcon />
        {isLoggingOut ? "Logging out..." : "Logout"}
      </button>
    </div>
  );
}
