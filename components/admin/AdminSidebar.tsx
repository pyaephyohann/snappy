"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BackIcon,
  DashboardIcon,
  LogoutIcon,
  SnapsIcon,
  UsersIcon,
} from "@/components/admin/icons";

interface AdminSidebarProps {
  onNavigate?: () => void;
}

const navItems = [
  { href: "/admin", label: "Dashboard", icon: DashboardIcon, exact: true },
  { href: "/admin/users", label: "Users", icon: UsersIcon, exact: false },
  { href: "/admin/snaps", label: "Snaps", icon: SnapsIcon, exact: false },
];

export default function AdminSidebar({ onNavigate }: AdminSidebarProps) {
  const pathname = usePathname();

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname.startsWith(href);

  return (
    <aside className="flex h-full flex-col border-r border-border bg-card/60">
      <div className="border-b border-border px-5 py-5">
        <Link
          href="/admin"
          onClick={onNavigate}
          className="flex items-center gap-2 text-primary"
        >
          <span className="text-xl font-bold caveat-font">Snappy</span>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            Admin
          </span>
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
